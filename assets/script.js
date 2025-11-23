// assets/script.js
// Evaluation app logic
// STORAGE KEY
const STORAGE_KEY = 'epsp_eval_employees_v1';

// API configuration: by default empty -> localStorage only.
// If you deploy Cloudflare Worker and want the UI to use it, set API_URL
// to the public endpoint of your worker (e.g. 'https://eval.example.workers.dev').
const API_URL = ""; // <-- set your Worker URL here (optional)
const API_TOKEN = ""; // <-- optional token to send as Authorization: Bearer <token>

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

function roleToPercent(role){
  switch(role){
    case 'medical': return 35;
    case 'paramedical': return 35;
    case 'psych': return 45;
    case 'common': default: return 30;
  }
}

// ---------- persistence ----------
async function loadEmployees(){
  if(API_URL){
    // try to fetch from API (fallback to localStorage if fails)
    try {
      const headers = API_TOKEN ? { 'Authorization': 'Bearer ' + API_TOKEN } : {};
      const res = await fetch(API_URL + '/api/employees', { headers });
      if(res.ok){
        const data = await res.json();
        if(Array.isArray(data)) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
          return data;
        }
      }
    } catch(e){ console.warn('API load failed, fallback to local'); }
  }
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
}

async function saveEmployees(list){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  if(API_URL){
    try {
      const headers = { 'Content-Type': 'application/json' };
      if(API_TOKEN) headers['Authorization'] = 'Bearer ' + API_TOKEN;
      await fetch(API_URL + '/api/employees', {
        method: 'PUT',
        headers,
        body: JSON.stringify(list)
      });
    } catch(e){ console.warn('API save failed'); }
  }
}

// ---------- discipline algorithm ----------
function calcDisciplinePoints(absences, lateness){
  // From spec:
  // start = 6, -1 per absence, -0.5 per lateness. clamp 0..6. round 2 decimals.
  let pts = 6 - (Number(absences || 0) * 1 + Number(lateness || 0) * 0.5);
  if(pts < 0) pts = 0;
  if(pts > 6) pts = 6;
  return Math.round(pts * 100) / 100;
}

// ---------- UI helpers ----------
function el(tag, attrs = {}, ...children){
  const e = document.createElement(tag);
  for(let k in attrs){
    if(k === 'class') e.className = attrs[k];
    else if(k.startsWith('data-')) e.setAttribute(k, attrs[k]);
    else if(k === 'onclick') e.onclick = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  children.flat().forEach(c => {
    if(typeof c === 'string') e.appendChild(document.createTextNode(c));
    else if(c) e.appendChild(c);
  });
  return e;
}

function formatDate(d){
  const dt = new Date(d);
  return dt.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
}

// ---------- render ----------
async function renderEmployeeList(){
  const list = await loadEmployees();
  const container = document.getElementById('employeesList');
  container.innerHTML = '';
  if(list.length === 0){
    container.appendChild(el('div', { class:'text-xs text-gray-500' }, 'لا توجد سجلات بعد.'));
    return;
  }
  for(const emp of list){
    const card = el('div',{class:'p-2 border rounded bg-white flex items-center justify-between'},
      el('div', {}, 
        el('div', { class:'font-medium' }, emp.name + (emp.matricule ? ` — ${emp.matricule}` : '')),
        el('div', { class:'text-xs text-gray-500' }, `السلك: ${emp.role} · نسبة: ${roleToPercent(emp.role)}%`)
      ),
      el('div', { class:'flex gap-2' },
        el('button', { class:'evalBtn bg-yellow-400 p-1 rounded text-xs', 'data-id': emp.id, onclick:()=> showEvalForm(emp.id) }, 'تقييم'),
        el('button', { class:'historyBtn bg-blue-500 text-white p-1 rounded text-xs', onclick:()=> showHistory(emp.id) }, 'سجل'),
        el('button', { class:'deleteBtn bg-red-500 text-white p-1 rounded text-xs', onclick: async ()=> {
          if(!confirm('حذف الموظف؟ سيتم حذف سجل التقييمات أيضاً.')) return;
          const newList = (await loadEmployees()).filter(e => e.id !== emp.id);
          await saveEmployees(newList);
          await renderEmployeeList();
          renderHistoryAll();
        } }, 'حذف')
      )
    );
    container.appendChild(card);
  }
}

// ---------- add employee ----------
document.getElementById('employeeForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const name = document.getElementById('empName').value.trim();
  const matricule = document.getElementById('empMatricule').value.trim();
  const role = document.getElementById('empRole').value;
  if(!name) return alert('أدخل اسم الموظف');
  const list = await loadEmployees();
  const emp = { id: uid(), name, matricule, role, evaluations: [] };
  list.push(emp);
  await saveEmployees(list);
  document.getElementById('employeeForm').reset();
  await renderEmployeeList();
  renderHistoryAll();
});

// export
document.getElementById('exportBtn').addEventListener('click', async () => {
  const data = await loadEmployees();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'employees_evaluations.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});

// clear (local only)
document.getElementById('clearBtn').addEventListener('click', async () => {
  if(!confirm('مسح كل البيانات المحلية؟ (هذا سيُحذف من localStorage فقط)')) return;
  localStorage.removeItem(STORAGE_KEY);
  await renderEmployeeList();
  renderHistoryAll();
});

// import
document.getElementById('importBtn').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = async (ev) => {
    const f = ev.target.files[0];
    if(!f) return;
    const txt = await f.text();
    try {
      const data = JSON.parse(txt);
      if(!Array.isArray(data)) throw 'invalid';
      await saveEmployees(data);
      await renderEmployeeList();
      renderHistoryAll();
      alert('تم الاستيراد');
    } catch (e) {
      alert('ملف غير صالح');
    }
  };
  input.click();
});

// ---------- show eval form ----------
async function showEvalForm(empId){
  const list = await loadEmployees();
  const emp = list.find(e => e.id === empId);
  if(!emp) return alert('الموظف غير موجود');
  const area = document.getElementById('evalArea');
  area.innerHTML = '';

  const card = el('div', { class:'p-4 border rounded bg-gray-50' },
    el('h3', { class:'font-semibold mb-2' }, `${emp.name} — تقييم جديد`),
    // form
    (() => {
      const form = el('form', { id:'evalForm', class:'space-y-3' });

      // discipline inputs (absences, lateness)
      const disciplineBlock = el('div', { class:'grid grid-cols-1 gap-2' },
        el('label', {}, el('div', {}, '1) احترام قواعد الانضباط العام (أدخل عدد الغيابات و التأخرات خلال آخر 3 أشهر)'),
          el('div', { class:'flex gap-2 mt-2' },
            el('input', { id:'absences', type:'number', min:0, value:0, class:'p-2 border rounded w-24' }),
            el('span', { class:'self-center' }, 'غياب'),
            el('input', { id:'lateness', type:'number', min:0, value:0, class:'p-2 border rounded w-24' }),
            el('span', { class:'self-center' }, 'تأخر')
          ),
          el('div', { class:'text-xs text-gray-500 mt-1' }, 'الخوارزمية: خصم 1 نقطة عن كل غياب و0.5 عن كل تأخر من أصل 6 نقاط.')
        )
      );

      // other criteria (each 0..6)
      const criteria = ['الالتزام والمواطنة','الاهتمام بتنفيذ المهام','السرعة في تنفيذ المهام','روح الاتصال والعلاقات البشرية'];
      const ids = ['commitment','attention','speed','relations'];

      const grid = el('div', { class:'grid md:grid-cols-2 gap-2' });
      for(let i=0;i<ids.length;i++){
        grid.appendChild(el('label', {},
          el('div', {}, `${i+2}) ${criteria[i]} (0-6)`),
          el('input', { id: ids[i], type:'number', min:0, max:6, value:6, class:'p-2 border rounded w-full' })
        ));
      }

      // manager discretionary points (extra 0..10)
      const managerBlock = el('label', {},
        el('div', {}, 'نقاط المدير (تقديرية) — 0 إلى 10'),
        el('input', { id:'managerPoints', type:'number', min:0, max:10, value:0, class:'p-2 border rounded w-full' }),
        el('div', { class:'text-xs text-gray-500' }, 'هذه النقاط تُضاف إلى المجموع من 30 للحصول على 0..40 إذا كان مؤسستكم تعتمد ذلك. (عادة المدير يحتفظ ب10)') 
      );

      // result display, submit buttons
      const resultDiv = el('div', { id:'calcResult', class:'mt-2 text-sm text-gray-700' }, '');

      const buttons = el('div', { class:'flex gap-2 mt-2' },
        el('button', { class:'bg-blue-600 text-white p-2 rounded', type:'submit' }, 'احفظ التقييم'),
        el('button', { class:'bg-gray-200 p-2 rounded', type:'button', onclick: ()=> renderEmployeeList() }, 'إلغاء')
      );

      form.appendChild(disciplineBlock);
      form.appendChild(grid);
      form.appendChild(managerBlock);
      form.appendChild(buttons);
      form.appendChild(resultDiv);

      // handlers to update calculation
      const updateCalc = () => {
        const abs = Number(document.getElementById('absences').value || 0);
        const late = Number(document.getElementById('lateness').value || 0);
        const discipline = calcDisciplinePoints(abs, late);
        const commit = Number(document.getElementById('commitment').value || 0);
        const attention = Number(document.getElementById('attention').value || 0);
        const speed = Number(document.getElementById('speed').value || 0);
        const relations = Number(document.getElementById('relations').value || 0);
        const manager = Number(document.getElementById('managerPoints').value || 0);
        const subtotal = Math.round((discipline + commit + attention + speed + relations) * 100) / 100; // out of 30
        const percentRole = roleToPercent(emp.role);
        const percentValue = Math.round((subtotal / 30) * percentRole * 100) / 100;
        const overallPoints = Math.round((subtotal + manager) * 100) / 100;
        resultDiv.innerText = `نقاط الانضباط: ${discipline} /6 · مجموع التنقيط: ${subtotal} /30 · نسبة المنحة (${percentRole}%): ${percentValue}% · بعد نقاط المدير: مجموع ${overallPoints}`;
      }

      // attach input listeners
      ['absences','lateness','commitment','attention','speed','relations','managerPoints'].forEach(id=>{
        // use delegated later - but ensure element exists
        form.addEventListener('input', updateCalc);
      });

      // submit handler
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const abs = Number(document.getElementById('absences').value || 0);
        const late = Number(document.getElementById('lateness').value || 0);
        const discipline = calcDisciplinePoints(abs, late);
        const commitment = Number(document.getElementById('commitment').value || 0);
        const attention = Number(document.getElementById('attention').value || 0);
        const speed = Number(document.getElementById('speed').value || 0);
        const relations = Number(document.getElementById('relations').value || 0);
        const manager = Number(document.getElementById('managerPoints').value || 0);
        const subtotal = Math.round((discipline + commitment + attention + speed + relations) * 100) / 100;
        const percentRole = roleToPercent(emp.role);
        const percentValue = Math.round((subtotal / 30) * percentRole * 100) / 100;
        const entry = {
          id: uid(),
          date: new Date().toISOString(),
          scores: { discipline, commitment, attention, speed, relations },
          disciplineDetails: { absences: abs, lateness: late },
          managerPoints: manager,
          subtotal,
          percentRole,
          percentValue
        };
        // save
        const all = await loadEmployees();
        const idx = all.findIndex(e => e.id === emp.id);
        if(idx === -1) return alert('خطأ: الموظف غير موجود');
        all[idx].evaluations.push(entry);
        await saveEmployees(all);
        alert('تم حفظ التقييم');
        await renderEmployeeList();
        renderHistoryAll();
        showEvalForm(emp.id); // reopen to allow next eval
      });

      // initial calc
      setTimeout(() => {
        updateCalc();
      }, 50);

      return form;
    })()
  );

  area.appendChild(card);
}

// ---------- history (single employee) ----------
async function showHistory(empId){
  const list = await loadEmployees();
  const emp = list.find(e => e.id === empId);
  if(!emp) return alert('الموظف غير موجود');
  const area = document.getElementById('evalArea');
  area.innerHTML = '';
  const header = el('div', { class:'mb-2' }, el('div', { class:'font-medium' }, `سجل التقييم — ${emp.name}`));
  const table = el('div', { class:'space-y-2' });
  if((emp.evaluations || []).length === 0) table.appendChild(el('div', { class:'text-xs text-gray-500' }, 'لا توجد تقييمات بعد.'));
  else {
    emp.evaluations.slice().reverse().forEach(ev => {
      const row = el('div', { class:'p-2 border rounded bg-white' },
        el('div', { class:'text-xs text-gray-600' }, `التاريخ: ${formatDate(ev.date)}`),
        el('div', { class:'text-sm' }, `مجموع: ${ev.subtotal} /30 · نسبة السلك: ${ev.percentRole}% · قيمة المنحة حسب التنقيط: ${ev.percentValue}%`),
        el('div', { class:'text-xs text-gray-600' }, `الانضباط: ${ev.scores.discipline} (غياب: ${ev.disciplineDetails.absences}, تأخر: ${ev.disciplineDetails.lateness})`),
        el('div', { class:'text-xs text-gray-600' }, `تفاصيل: الالتزام ${ev.scores.commitment} · الاهتمام ${ev.scores.attention} · السرعة ${ev.scores.speed} · العلاقات ${ev.scores.relations}`),
        el('div', { class:'text-xs text-gray-500 mt-1' }, `نقاط المدير: ${ev.managerPoints || 0}`)
      );
      table.appendChild(row);
    });
  }
  area.appendChild(header);
  area.appendChild(table);
}

// ---------- show all history (global) ----------
async function renderHistoryAll(){
  const hist = document.getElementById('history');
  hist.innerHTML = '';
  const list = await loadEmployees();
  if(list.length === 0) { hist.appendChild(el('div', { class:'text-xs text-gray-500' }, 'لا توجد سجلات بعد.')); return; }
  list.forEach(emp => {
    const badge = el('div', { class:'p-2 border rounded bg-white mb-2' },
      el('div', { class:'font-medium' }, emp.name),
      el('div', { class:'text-xs text-gray-500' }, `تقييمات: ${emp.evaluations ? emp.evaluations.length : 0} · السلك: ${emp.role}`)
    );
    hist.appendChild(badge);
  });
}

// bootstrap
(async function init(){
  await renderEmployeeList();
  await renderHistoryAll();
})();