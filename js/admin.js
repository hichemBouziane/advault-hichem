// ==========================================
//  إعدادات Supabase
// ==========================================
const SUPABASE_URL = "https://uljdazwcjxogpymvbflq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DGoBEde67ewtWtMlC4Nx9w_cuvSAmUc";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================================
//  إعدادات Meta & Gemini
// ==========================================
const META_ACCESS_TOKEN = "ضع_هنا_توكن_ميتا_الخاص_بالمطورين";
const META_AD_ACCOUNT_ID = "act_ضع_هنا_رقم_الحساب_الاعلاني";
const GEMINI_API_KEY = "AQ.Ab8RN6KeOoitkHChvbjn6l25tyPeGwMxjuhRPlg-Bz789QLDFg";

// ==========================================
//  تهيئة الصفحة عند التحميل
// ==========================================
let user;

document.addEventListener('DOMContentLoaded', () => {
    user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user || user.role !== 'admin') {
        window.location.href = 'index.html';
        return;
    }
    document.getElementById('user-welcome').innerText = `مرحباً، ${user.name}`;
    loadAdminData();
});

// ==========================================
//  جلب بيانات الحملات من Google Sheets
// ==========================================
async function fetchMetaCampaignsSpend() {
    const CLEAN_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRHi9J9axOomtAw1vM9Y2VE_vHkOPwO77R2MDBiKKJfC3yXynHjBTaUzO1hFs3AEeZTmhEu9gBwHDDq/pub?gid=1473599105&single=true&output=csv";
    try {
        console.log("🔄 جاري بدء الاتصال بـ Google Sheets...");
        const response = await fetch(CLEAN_SHEET_URL, { cache: "no-store" });
        if (!response.ok) throw new Error("Network response was not ok");
        const rawText = await response.text();
        const lines = rawText.split('\n');
        const campaigns = [];
        for (let i = 1; i < lines.length; i++) {
            const currentLine = lines[i].trim();
            if (!currentLine) continue;
            const columns = currentLine.split(',');
            const campaignName = columns[0]?.replace(/["']/g, '').trim();
            const spendValue = parseFloat(columns[1]?.replace(/["']/g, '').trim()) || 0;
            if (campaignName) {
                campaigns.push({ name: campaignName, insights: { data: [{ spend: spendValue }] } });
            }
        }
        console.log("✅ تم المعالجة بنجاح! عدد الحملات:", campaigns.length);
        return campaigns;
    } catch (e) {
        console.error("❌ خطأ أثناء معالجة قوقل شيت:", e.message);
        return [];
    }
}

function calculateSpendForKeyword(campaigns, keyword) {
    if (!keyword) return 0;
    let totalSpend = 0;
    campaigns.forEach(camp => {
        if (camp.name.toLowerCase().includes(keyword.toLowerCase())) {
            if (camp.insights?.data?.[0]) totalSpend += parseFloat(camp.insights.data[0].spend || 0);
        }
    });
    return totalSpend;
}

// ==========================================
//  تحميل بيانات لوحة تحكم الأدمن
// ==========================================
async function loadAdminData() {
    const metaCampaigns = await fetchMetaCampaignsSpend();
    let { data: clients } = await _supabase.from('clients').select('*').eq('role', 'client').order('created_at', { ascending: false });
    const adminTable = document.getElementById('admin-clients-table');
    adminTable.innerHTML = '';
    if (!clients || clients.length === 0) {
        adminTable.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-400">لا يوجد زبائن حالياً.</td></tr>';
        return;
    }
    clients.forEach(async (client) => {
        let facebookSpendEuro = calculateSpendForKeyword(metaCampaigns, client.campaign_keyword);
        let { data: payments } = await _supabase.from('payments').select('amount_euro').eq('client_id', client.id);
        let totalPaidEuro = payments?.reduce((sum, item) => sum + parseFloat(item.amount_euro || 0), 0) || 0;
        let facebookSpendWithProfit = (parseFloat(facebookSpendEuro) || 0) * 1.2;
        let remainingEuro = facebookSpendWithProfit - (parseFloat(totalPaidEuro) || 0);
        let finalDebtDzd = Math.round(remainingEuro * (parseFloat(client.exchange_rate) || 240));
        adminTable.innerHTML += `
            <tr class="hover:bg-gray-50 border-b border-gray-100">
                <td class="p-3 font-medium">
                    <button onclick="openClientPayments('${client.id}', '${client.name}')"
                        class="text-indigo-600 hover:text-indigo-800 hover:underline font-bold cursor-pointer transition">
                        ${client.name}
                    </button>
                </td>
                <td class="p-3 text-indigo-600 font-semibold">${client.campaign_keyword || '-'}</td>
                <td class="p-3 font-semibold">€ ${facebookSpendWithProfit.toFixed(2)}</td>
                <td class="p-3 text-emerald-600">${totalPaidEuro.toFixed(2)} €</td>
                <td class="p-3 text-gray-500">${client.exchange_rate} دج</td>
                <td class="p-3 font-bold ${finalDebtDzd > 0 ? 'text-red-500' : 'text-gray-700'}">${finalDebtDzd.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} دج</td>
            </tr>`;
    });
}

// ==========================================
//  إدارة نافذة إضافة زبون جديد
// ==========================================
function openModal(id) {
    if (id === 'client-modal') document.getElementById('client-modal').classList.remove('hidden');
}

function closeClientModal() {
    document.getElementById('client-modal').classList.add('hidden');
}

async function saveNewClient() {
    const name = document.getElementById('new-client-name').value.trim();
    const phone = document.getElementById('new-client-phone').value.trim();
    const email = document.getElementById('new-client-email').value.trim();
    const password = document.getElementById('new-client-pass').value.trim();
    const keyword = document.getElementById('new-client-keyword').value.trim();
    const rate = document.getElementById('new-client-rate').value.trim();
    if (!name || !phone || !email || !password || !keyword || !rate) return;
    await _supabase.from('clients').insert([{ name, phone, email, password, role: 'client', campaign_keyword: keyword, exchange_rate: parseInt(rate) }]);
    closeClientModal();
    loadAdminData();
}

// ==========================================
//  إدارة نافذة تسجيل الدفعات اليدوية
// ==========================================
window.openPaymentModal = async function () {
    const modal = document.getElementById('payment-modal');
    const select = document.getElementById('pop-client-select');
    document.getElementById('pop-payment-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('pop-payment-note').value = "Versement";
    document.getElementById('pop-amount-dzd').value = "";
    document.getElementById('pop-amount-euro').value = "";
    select.innerHTML = '<option value="">-- جاري تحميل الزبائن... --</option>';
    try {
        const { data: clients, error } = await _supabase.from('clients').select('id, name, exchange_rate').order('name', { ascending: true });
        if (error) throw error;
        select.innerHTML = '<option value="">-- اختر الزبون من القائمة --</option>';
        clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.setAttribute('data-name', client.name);
            option.setAttribute('data-rate', client.exchange_rate || 240);
            option.innerText = client.name;
            select.appendChild(option);
        });
    } catch (e) {
        console.error("خطأ في جلب قائمة الزبائن:", e);
        select.innerHTML = '<option value="">❌ فشل تحميل الزبائن</option>';
    }
};

function updateEuroFromDzd() {
    const selectEl = document.getElementById('pop-client-select');
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    if (!selectedOption || !selectEl.value) return;
    const rate = parseFloat(selectedOption.getAttribute('data-rate')) || 240;
    const amountDzd = parseFloat(document.getElementById('pop-amount-dzd').value) || 0;
    if (amountDzd > 0) {
        document.getElementById('pop-amount-euro').value = (amountDzd / rate).toFixed(2);
    } else {
        document.getElementById('pop-amount-euro').value = "";
    }
}

function closePaymentModal() {
    document.getElementById('payment-modal').classList.add('hidden');
    document.getElementById('manual-payment-form').reset();
}

async function submitManualPayment(event) {
    event.preventDefault();
    const selectEl = document.getElementById('pop-client-select');
    const clientId = selectEl.value;
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const clientName = selectedOption.getAttribute('data-name');
    const amountDzd = parseFloat(document.getElementById('pop-amount-dzd').value);
    const amountEuro = parseFloat(document.getElementById('pop-amount-euro').value);
    const paymentDate = document.getElementById('pop-payment-date').value;
    let paymentNote = document.getElementById('pop-payment-note').value.trim();
    if (!paymentNote) paymentNote = "Versement";
    if (!clientId || !amountDzd || isNaN(amountEuro) || !paymentDate) {
        alert("يرجى ملء الحقول الأساسية بشكل صحيح.");
        return;
    }
    try {
        const { data: newPayment, error: payErr } = await _supabase
            .from('payments')
            .insert([{ client_id: clientId, amount_dzd: amountDzd, amount_euro: amountEuro, note: paymentNote, date: paymentDate }])
            .select().single();
        if (payErr) throw payErr;
        const adCapital = parseFloat((amountDzd * 0.8).toFixed(2));
        const totalProfit = parseFloat((amountDzd - adCapital).toFixed(2));
        const companyProfit = parseFloat((totalProfit * 0.30).toFixed(2));
        const myProfit = parseFloat((totalProfit * 0.70).toFixed(2));
        const timestampWithTime = `${paymentDate}T12:00:00Z`;
        const { error: arcErr } = await _supabase.from('profits_archive').insert([{
            payment_id: newPayment.id, client_name: clientName, amount_received: amountDzd,
            ad_capital: adCapital, total_profit: totalProfit, company_profit: companyProfit,
            my_profit: myProfit, created_at: timestampWithTime
        }]);
        if (arcErr) throw arcErr;
        alert(`✅ تم تسجيل مبلغ ${amountDzd.toLocaleString('fr-FR')} دج (${amountEuro} €) بنجاح تحت ملاحظة: "${paymentNote}".`);
        closePaymentModal();
        if (typeof loadAdminData === 'function') loadAdminData();
        if (typeof loadAnalyticsData === 'function') loadAnalyticsData();
    } catch (err) {
        console.error("خطأ أثناء معالجة وحفظ الدفعة:", err);
        alert(`❌ فشل الاتصال بقاعدة البيانات: ${err.message}`);
    }
}

// ==========================================
//  إدارة نافذة دفعات الزبون
// ==========================================
async function openClientPayments(clientId, clientName) {
    document.getElementById('payments-modal-title').innerText = `دفعات الزبون: ${clientName}`;
    document.getElementById('client-payments-modal').classList.remove('hidden');
    const tbody = document.getElementById('client-payments-list');
    const noMsg = document.getElementById('no-payments-msg');
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">جاري التحميل...</td></tr>';
    noMsg.classList.add('hidden');
    const { data: payments, error } = await _supabase.from('payments').select('*').eq('client_id', clientId).order('date', { ascending: false });
    tbody.innerHTML = '';
    if (!payments || payments.length === 0) {
        noMsg.classList.remove('hidden');
        return;
    }
    payments.forEach(p => {
        tbody.innerHTML += `
            <tr class="hover:bg-gray-50">
                <td class="p-3 text-gray-500">${p.date}</td>
                <td class="p-3 font-bold">${parseFloat(p.amount_dzd).toLocaleString('fr-FR')} دج</td>
                <td class="p-3 text-emerald-600 font-medium">${parseFloat(p.amount_euro).toFixed(2)} €</td>
                <td class="p-3 text-gray-500">${p.note || '-'}</td>
                <td class="p-3">
                    <div class="flex gap-2 justify-center">
                        <button onclick="openEditPayment('${p.id}', ${p.amount_dzd}, ${p.amount_euro}, '${p.date}', '${p.note || ''}')"
                            class="bg-amber-100 hover:bg-amber-200 text-amber-700 font-bold px-3 py-1 rounded-lg text-xs cursor-pointer transition">✏️ تعديل</button>
                        <button onclick="deletePayment('${p.id}', '${clientId}', '${clientName}')"
                            class="bg-red-100 hover:bg-red-200 text-red-700 font-bold px-3 py-1 rounded-lg text-xs cursor-pointer transition">🗑️ حذف</button>
                    </div>
                </td>
            </tr>`;
    });
}

function closePaymentsModal() {
    document.getElementById('client-payments-modal').classList.add('hidden');
}

function openEditPayment(id, dzd, euro, date, note) {
    document.getElementById('edit-payment-id').value = id;
    document.getElementById('edit-amount-dzd').value = dzd;
    document.getElementById('edit-amount-euro').value = euro;
    document.getElementById('edit-payment-date').value = date;
    document.getElementById('edit-payment-note').value = note;
    document.getElementById('edit-payment-modal').classList.remove('hidden');
}

async function saveEditedPayment() {
    const id = document.getElementById('edit-payment-id').value;
    const amountDzd = parseFloat(document.getElementById('edit-amount-dzd').value);
    const amountEuro = parseFloat(document.getElementById('edit-amount-euro').value);
    const date = document.getElementById('edit-payment-date').value;
    const note = document.getElementById('edit-payment-note').value.trim() || 'Versement';
    if (!amountDzd || !amountEuro || !date) {
        alert("يرجى ملء جميع الحقول.");
        return;
    }
    const { error } = await _supabase.from('payments').update({ amount_dzd: amountDzd, amount_euro: amountEuro, date, note }).eq('id', id);
    if (error) { alert("❌ فشل التعديل: " + error.message); return; }
    alert("✅ تم تعديل الدفعة بنجاح!");
    document.getElementById('edit-payment-modal').classList.add('hidden');
    loadAdminData();
}

async function deletePayment(paymentId, clientId, clientName) {
    if (!confirm("⚠️ هل أنت متأكد من حذف هذه الدفعة؟ لا يمكن التراجع عن هذا الإجراء!")) return;
    const { error } = await _supabase.from('payments').delete().eq('id', paymentId);
    if (error) { alert("❌ فشل الحذف: " + error.message); return; }
    alert("✅ تم حذف الدفعة بنجاح!");
    openClientPayments(clientId, clientName);
    loadAdminData();
}

// ==========================================
//  المساعد الصوتي الذكي
// ==========================================
function startVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("متصفحك لا يدعم التعرف على الصوت، يرجى استخدام Google Chrome.");
        return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'ar-DZ';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    const btn = document.getElementById('voice-btn');
    const status = document.getElementById('voice-status');
    const resultTxt = document.getElementById('voice-result-text');
    recognition.onstart = () => {
        status.innerText = "جاري الاستماع... تكلم الآن";
        btn.classList.add('animate-pulse', 'bg-red-50', 'text-red-600');
    };
    recognition.onerror = () => {
        status.innerText = "حدث خطأ في الاستماع، جرب مرة أخرى.";
        btn.classList.remove('animate-pulse', 'bg-red-50', 'text-red-600');
    };
    recognition.onend = () => {
        btn.classList.remove('animate-pulse', 'bg-red-50', 'text-red-600');
    };
    recognition.onresult = async (event) => {
        const textSpoken = event.results[0][0].transcript;
        resultTxt.innerText = `قلت: "${textSpoken}"`;
        resultTxt.classList.remove('hidden');
        status.innerText = "جاري تحليل الكلام وفهم الطلب...";
        await processVoiceWithAI(textSpoken);
    };
    recognition.start();
}

async function processVoiceWithAI(text) {
    const status = document.getElementById('voice-status');
    const prompt = `
    أنت نظام مالي جزائري ذكي يدير الحسابات والإعلانات. قم بتحليل الجملة التالية المكتوبة بالدارجة أو العربية وحدد نية المستخدم (Intent).
    الجملة: "${text}"

    يجب أن تحدد هل نية المستخدم هي:
    1. "insert": تسجيل دفعة مالية جديدة (مثل: سجل لمنير عشرة آلاف، أضف دفعة، دخلت مبلغا لفلان).
    2. "query": استعلام وسؤال عن الحسابات (مثل: شحال يسال منير، كم مستحقات منير).

    قواعد استخراج المبالغ بالدينار (DZD) في حالة الـ insert فقط:
    - "عشرين آلاف" أو "دوز ميا" تعني 20000، "مليون" يعني 10000، "ميا" تعني 1000.

    نوع الاستعلام (query_type) في حالة كان الطلب سؤالاً:
    - "balance": إذا كان السؤال عن إجمالي المستحقات.
    - "last_payment": إذا كان السؤال عن الدفعة الأخيرة.
    - "last_campaign": إذا كان السؤال عن الإعلان الأخير أو مصاريفه.

    يجب أن يكون الرد بصيغة JSON كالتالي تماماً وبدون أي كلام إضافي:
    {
      "intent": "insert" أو "query",
      "client_keyword": "الكلمة المفتاحية أو اسم الزبون",
      "amount_dzd": 0,
      "query_type": "balance" أو "last_payment" أو "last_campaign" أو null
    }
    `;
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        let aiResponseText = data.candidates[0].content.parts[0].text.trim();
        aiResponseText = aiResponseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const resultJson = JSON.parse(aiResponseText);
        if (!resultJson.client_keyword) {
            speakAndStatus("لم أفهم اسم الزبون بوضوح، أعد المحاولة من فضلك.");
            return;
        }
        const { data: client } = await _supabase.from('clients').select('*').ilike('campaign_keyword', `%${resultJson.client_keyword}%`).maybeSingle();
        let targetClient = client;
        if (!targetClient) {
            const { data: clientByName } = await _supabase.from('clients').select('*').ilike('name', `%${resultJson.client_keyword}%`).maybeSingle();
            targetClient = clientByName;
        }
        if (!targetClient) {
            speakAndStatus(`❌ لم أجد زبون في النظام يطابق الاسم: ${resultJson.client_keyword}`);
            return;
        }
        if (resultJson.intent === 'insert') {
            await handleAiInsert(targetClient, resultJson);
        } else if (resultJson.intent === 'query') {
            await handleAiQuery(targetClient, resultJson);
        }
    } catch (e) {
        console.error(e);
        speakAndStatus("❌ فشل الاتصال بالذكاء الاصطناعي أو تحليل البيانات.");
    }
}

async function handleAiInsert(client, data) {
    if (!data.amount_dzd || data.amount_dzd <= 0) {
        speakAndStatus("لم أستطع تحديد المبلغ المراد تسجيله بوضوح.");
        return;
    }
    const amountDzd = data.amount_dzd;
    const rate = client.exchange_rate || 240;
    const calculatedEuro = parseFloat((amountDzd / rate).toFixed(2));
    const { data: newPayment, error: paymentErr } = await _supabase.from('payments')
        .insert([{ client_id: client.id, amount_dzd: amountDzd, amount_euro: calculatedEuro, note: "تسجيل صوتي تلقائي", date: new Date().toISOString().split('T')[0] }])
        .select().single();
    if (paymentErr) { speakAndStatus("❌ حدث خطأ أثناء حفظ الدفعة في جدول المدفوعات."); return; }
    const adCapital = parseFloat((amountDzd * 0.8).toFixed(2));
    const totalProfit = parseFloat((amountDzd - adCapital).toFixed(2));
    const companyProfit = parseFloat((totalProfit * 0.30).toFixed(2));
    const myProfit = parseFloat((totalProfit * 0.70).toFixed(2));
    const { error: archiveErr } = await _supabase.from('profits_archive').insert([{
        payment_id: newPayment.id, client_name: client.name, amount_received: amountDzd,
        ad_capital: adCapital, total_profit: totalProfit, company_profit: companyProfit, my_profit: myProfit
    }]);
    if (archiveErr) {
        speakAndStatus("⚠️ تم تسجيل الدفعة، لكن فشل ترحيل الأرباح إلى جدول الأرشيف.");
    } else {
        speakAndStatus(`تم بنجاح تسجيل الدفعة وحساب أرباحك الصافية وهي ${myProfit} دينار وتم أرشفة العملية.`);
        loadAdminData();
    }
}

async function handleAiQuery(client, data) {
    if (data.query_type === 'balance') {
        const metaCampaigns = await fetchMetaCampaignsSpend();
        let totalSpendEuro = 0;
        metaCampaigns.forEach(camp => {
            if (camp.name.toLowerCase().includes(client.campaign_keyword.toLowerCase())) {
                if (camp.insights?.data?.[0]) totalSpendEuro += parseFloat(camp.insights.data[0].spend || 0);
            }
        });
        const { data: payments } = await _supabase.from('payments').select('amount_euro').eq('client_id', client.id);
        let totalPaidEuro = payments?.reduce((sum, item) => sum + parseFloat(item.amount_euro || 0), 0) || 0;
        let remainingEuro = totalSpendEuro - totalPaidEuro;
        let finalDebtDzd = Math.round(remainingEuro * (client.exchange_rate || 240));
        if (finalDebtDzd > 0) {
            speakAndStatus(`إجمالي المستحقات الحالية على الزبون ${client.name} هي ${finalDebtDzd.toLocaleString('fr-FR')} دينار جزائري.`);
        } else if (finalDebtDzd < 0) {
            speakAndStatus(`الزبون ${client.name} لديه رصيد مسبق الدفع قيمته ${Math.abs(finalDebtDzd).toLocaleString('fr-FR')} دينار جزائري.`);
        } else {
            speakAndStatus(`حساب الزبون ${client.name} متوازن تماماً، ومستحقاته الحالية هي صفر دينار.`);
        }
    } else if (data.query_type === 'last_payment') {
        const { data: lastPayment, error } = await _supabase.from('payments').select('*').eq('client_id', client.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (error || !lastPayment) {
            speakAndStatus(`لا توجد أي مدفوعات مسجلة سابقاً في النظام للزبون ${client.name}.`);
        } else {
            const pDate = lastPayment.date || "تاريخ غير محدد";
            speakAndStatus(`الدفعة الأخيرة للزبون ${client.name} كانت بتاريخ ${pDate} بقيمة ${lastPayment.amount_dzd.toLocaleString('fr-FR')} دينار جزائري.`);
        }
    } else if (data.query_type === 'last_campaign') {
        const metaCampaigns = await fetchMetaCampaignsSpend();
        let lastCamp = metaCampaigns.find(camp => camp.name.toLowerCase().includes(client.campaign_keyword.toLowerCase()));
        if (lastCamp && lastCamp.insights?.data?.[0]) {
            let spendEuro = parseFloat(lastCamp.insights.data[0].spend || 0);
            let spendDzd = Math.round(spendEuro * (client.exchange_rate || 240));
            speakAndStatus(`تكلفة الإعلان الأخير للزبون ${client.name} المسمى ${lastCamp.name} بلغت ${spendEuro.toFixed(2)} يورو، أي ما يعادل ${spendDzd.toLocaleString('fr-FR')} دينار جزائري.`);
        } else {
            speakAndStatus(`لم أجد أي حملات إعلانية نشطة أو حديثة حالياً للزبون ${client.name} على فيسبوك.`);
        }
    }
}

function speakAndStatus(message) {
    document.getElementById('voice-status').innerText = message;
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.lang = 'ar-SA';
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
    }
}

// ==========================================
//  تسجيل الخروج
// ==========================================
function handleLogout() {
    localStorage.clear();
    window.location.href = 'index.html';
}