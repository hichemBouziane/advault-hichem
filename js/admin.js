// ==========================================
//  إعدادات Supabase
// ==========================================
window.SUPABASE_URL = window.SUPABASE_URL || "https://uljdazwcjxogpymvbflq.supabase.co";
window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "sb_publishable_DGoBEde67ewtWtMlC4Nx9w_cuvSAmUc";
window._supabase = window._supabase || supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// ==========================================
//  إعدادات Meta & Gemini
// ==========================================

window.GEMINI_API_KEY = window.GEMINI_API_KEY || "AQ.Ab8RN6KeOoitkHChvbjn6l25tyPeGwMxjuhRPlg-Bz789QLDFg";

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
    loadSummaryCards();
    fetchHeaderBalance(); // استدعاء دالة جلب الرصيد للهيدر
    checkPendingRequests(); // استدعاء دالة جلب عدد الطلبات المعلقة
});

// ==========================================
//  Toast + Sound Notification
// ==========================================
function showToast(message) {
    // الصوت
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(880, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.1);
        g.gain.setValueAtTime(0.25, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        o.start(ctx.currentTime);
        o.stop(ctx.currentTime + 0.4);
    } catch(e) {}

    // الإشعار
    const toast = document.getElementById('toast-notification');
    document.getElementById('toast-msg-body').innerText = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
}

// ==========================================
//  جلب الرصيد العام من قوقل شيت وعرضه في الهيدر
// ==========================================
async function fetchHeaderBalance() {
    const BALANCE_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRHi9J9axOomtAw1vM9Y2VE_vHkOPwO77R2MDBiKKJfC3yXynHjBTaUzO1hFs3AEeZTmhEu9gBwHDDq/pub?gid=377665608&single=true&output=csv";
    try {
        const response = await fetch(BALANCE_SHEET_URL, { cache: "no-store" });
        if (!response.ok) throw new Error("فشل الاتصال بملف الرصيد");
        
        const rawText = await response.text();
        // استخراج السطر الأول وتقسيمه لجلب الخلية A1 و B1
        const firstLine = rawText.split('\n')[0];
        const columns = firstLine.split(',');
        let a1Value = columns[0] ? columns[0].replace(/["']/g, '').trim() : "0";
        let b1Value = columns[1] ? columns[1].replace(/["']/g, '').trim() : "292";
        
        // تحويل الفاصلة العادية إلى نقطة عشرية ليقرأها الجافاسكربت بشكل صحيح
        let normalizedValue = a1Value.replace(',', '.');
        const parsedValue = parseFloat(normalizedValue);

        // 1. تحديث قيمة الـ Spend الحالي (مكان الـ 0.00)
        const fbSpendEl = document.getElementById('fb-current-spend');
        if (fbSpendEl) {
            if (!isNaN(parsedValue)) {
                // عرض الرقم بالصيغة المحلية (يمكنك تغييرها إلى 'en-US' إذا كنت تفضل النقطة)
                fbSpendEl.innerText = parsedValue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } else {
                fbSpendEl.innerText = a1Value; // في حال فشل التحويل يعرض النص الخام
            }
        }

        // 2. تحديث شريط التقدم (Progress Bar) تلقائياً بناءً على العتبة المستخرجة من B1
        let normalizedThreshold = b1Value.replace(',', '.');
        const maxThreshold = parseFloat(normalizedThreshold) || 292;

        const fbMaxEl = document.getElementById('fb-max-spend');
        if (fbMaxEl) {
            fbMaxEl.innerText = maxThreshold.toLocaleString('fr-FR');
        }

        const progressBar = document.getElementById('fb-progress-bar');
        if (progressBar && !isNaN(parsedValue)) {
            // حساب النسبة المئوية بحيث لا تتخطى 100%
            let percentage = (parsedValue / maxThreshold) * 100;
            percentage = Math.min(Math.max(percentage, 0), 100); 
            
            // تحديث عرض الأنميشن للشريط
            progressBar.style.width = `${percentage}%`;

            // إزالة جميع الألوان السابقة لتفادي التداخل
            progressBar.classList.remove('bg-indigo-600', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-red-600');

            // تطبيق اللون الجديد حسب نسبة الخطورة
            if (percentage <= 25) {
                progressBar.classList.add('bg-emerald-500');
            } else if (percentage <= 50) {
                progressBar.classList.add('bg-purple-500');
            } else if (percentage <= 75) {
                progressBar.classList.add('bg-amber-500');
            } else {
                progressBar.classList.add('bg-red-600');
            }
        }

        // 3. تحديث عنصر الهيدر الرئيسي (إذا كنت ما زلت تستخدمه)
        const balanceEl = document.getElementById('header-balance');
        if (balanceEl) {
            balanceEl.innerText = isNaN(parsedValue) ? a1Value : `${parsedValue.toLocaleString('fr-FR')} $`;
        }

    } catch (e) {
        console.error("❌ خطأ في جلب الرصيد وتحديث البيانات:", e.message);
        const fbSpendEl = document.getElementById('fb-current-spend');
        if (fbSpendEl) fbSpendEl.innerText = "خطأ!";
    }
}

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
            const campaignId = columns[0]?.replace(/["']/g, '').trim();
            const campaignName = columns[1]?.replace(/["']/g, '').trim();
            const spendValue = parseFloat(columns[2]?.replace(/["']/g, '').trim()) || 0;
            if (campaignId && campaignName) {
                campaigns.push({
                    id: campaignId,
                    name: campaignName,
                    insights: { data: [{ spend: spendValue }] }
                });
            }
        }
        console.log("✅ تم المعالجة بنجاح! عدد الحملات:", campaigns.length);
        return campaigns;
    } catch (e) {
        console.error("❌ خطأ أثناء معالجة قوقل شيت:", e.message);
        return [];
    }
}

// ==========================================
//  مزامنة الحملات من Google Sheets إلى Supabase
// ==========================================
async function syncCampaignsToSupabase(campaigns) {
    if (!campaigns || campaigns.length === 0) return;

    console.log("🔄 جاري مزامنة الحملات مع Supabase...");

    // بناء مصفوفة الحملات للرفع
    const upsertData = campaigns.map(camp => ({
        campaign_id: camp.id,
        campaign_name: camp.name,
        facebook_spend_euro: parseFloat(camp.insights?.data?.[0]?.spend || 0),
        updated_at: new Date().toISOString()
    }));

    // upsert: يحدّث إذا موجود، يضيف إذا جديد — بدون حذف أي شيء
    const { error } = await _supabase
        .from('facebook_campaigns')
        .upsert(upsertData, {
            onConflict: 'campaign_id',
            ignoreDuplicates: false
        });

    if (error) {
        console.error("❌ فشل المزامنة مع Supabase:", error.message);
    } else {
        console.log(`✅ تمت المزامنة بنجاح! ${upsertData.length} حملة محدّثة في Supabase.`);
    }
}

// ==========================================
//  جلب الحملات من Supabase (بديل سريع)
// ==========================================
async function getCampaignsFromSupabase() {
    const { data, error } = await _supabase
        .from('facebook_campaigns')
        .select('campaign_name, facebook_spend_euro');

    if (error || !data || data.length === 0) return null;

    // تحويل البيانات لنفس شكل fetchMetaCampaignsSpend
    return data.map(row => ({
        name: row.campaign_name,
        insights: { data: [{ spend: row.facebook_spend_euro }] }
    }));
}

// ==========================================
//  الدالة الرئيسية: جلب + مزامنة ذكية
// ==========================================
async function getAndSyncCampaigns() {
    // 1. العرض الفوري من قاعدة البيانات (للسرعة)
    const cached = await getCampaignsFromSupabase();

    // 2. التحديث في الخلفية من Google Sheets إلى Supabase
    fetchMetaCampaignsSpend().then(freshCampaigns => {
        if (freshCampaigns.length > 0) {
            syncCampaignsToSupabase(freshCampaigns);
        }
    }).catch(err => console.error("خطأ التحديث الخلفي:", err));

    // 3. إرجاع البيانات المخزنة فوراً
    return cached || [];
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
    const metaCampaigns = await getAndSyncCampaigns();
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
                <td class="p-3 font-semibold">$ ${facebookSpendWithProfit.toFixed(2)}</td>
                <td class="p-3 text-emerald-600">${totalPaidEuro.toFixed(2)} $</td>
                <td class="p-3 text-gray-500">${client.exchange_rate} دج</td>
                <td class="p-3 font-bold ${finalDebtDzd > 0 ? 'text-red-500' : 'text-gray-700'}">${finalDebtDzd.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} دج</td>
            </tr>`;
    });
}




// ==========================================
//  تحميل البطاقات الإحصائية السريعة
// ==========================================
async function loadSummaryCards() {
    // 1. جلب دفعات هذا الشهر من profits_archive
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const { data: monthRecords } = await _supabase
        .from('profits_archive')
        .select('amount_received, company_profit, my_profit')
        .gte('created_at', startOfMonth)
        .lte('created_at', endOfMonth);

    let monthPayments  = 0;
    let monthCompany   = 0;
    let monthMyProfit  = 0;

    (monthRecords || []).forEach(r => {
        monthPayments += parseFloat(r.amount_received || 0);
        monthCompany  += parseFloat(r.company_profit  || 0);
        monthMyProfit += parseFloat(r.my_profit       || 0);
    });

    // 2. حساب الأرصدة الموجبة والسالبة من جدول الزبائن
    const metaCampaigns = await getCampaignsFromSupabase() || [];
    const { data: clients } = await _supabase
        .from('clients')
        .select('id, campaign_keyword, exchange_rate')
        .eq('role', 'client');

    let totalPositive = 0;
    let totalNegative = 0;

    const promises = (clients || []).map(async client => {
        let spendEuro = 0;
        metaCampaigns.forEach(camp => {
            if (camp.name.toLowerCase().includes((client.campaign_keyword || '').toLowerCase())) {
                spendEuro += parseFloat(camp.insights?.data?.[0]?.spend || 0);
            }
        });
        const spendWithProfit = spendEuro * 1.2;
        const { data: payments } = await _supabase
            .from('payments')
            .select('amount_euro')
            .eq('client_id', client.id);
        const totalPaid = (payments || []).reduce((s, p) => s + parseFloat(p.amount_euro || 0), 0);
        const remaining = spendWithProfit - totalPaid;
        const debtDzd   = Math.round(remaining * (client.exchange_rate || 240));
        if (debtDzd > 0) totalNegative += debtDzd;
        else              totalPositive += Math.abs(debtDzd);
    });

    await Promise.all(promises);

    // 3. تحديث الواجهة
    const fmt = n => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' دج';
    document.getElementById('summary-month-payments').innerText = fmt(monthPayments);
    document.getElementById('summary-positive').innerText       = fmt(totalPositive);
    document.getElementById('summary-negative').innerText       = fmt(totalNegative);
    document.getElementById('summary-company-month').innerText  = fmt(monthCompany);
    document.getElementById('summary-my-month').innerText       = fmt(monthMyProfit);
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
    document.getElementById('pop-exchange-rate').value = "";
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

// دالة جلب سعر الصرف عند تغيير الزبون
window.handleClientSelection = function() {
    const selectEl = document.getElementById('pop-client-select');
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    if (!selectedOption || !selectEl.value) return;
    const rate = parseFloat(selectedOption.getAttribute('data-rate')) || 240;
    document.getElementById('pop-exchange-rate').value = rate;
    updateEuroFromDzd(); // تحديث الحساب تلقائياً
}

// تحديث المبالغ بناء على السعر القابل للتعديل
window.updateEuroFromDzd = function() {
    const rateInput = document.getElementById('pop-exchange-rate').value;
    const rate = parseFloat(rateInput) || 240;
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
    const currentExchangeRate = parseFloat(document.getElementById('pop-exchange-rate').value) || 240;
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

        // تحديث سعر الصرف الخاص بالزبون لكي يحفظ للدفعة القادمة
        const oldRate = parseFloat(selectedOption.getAttribute('data-rate')) || 240;
        if (currentExchangeRate !== oldRate) {
            await _supabase.from('clients').update({ exchange_rate: currentExchangeRate }).eq('id', clientId);
        }

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
        showSuccessNotification(`تم الحفظ: ${amountDzd.toLocaleString('fr-FR')} دج`);
        closePaymentModal();
        if (typeof loadAdminData === 'function') loadAdminData();
        if (typeof loadAnalyticsData === 'function') loadAnalyticsData();
    } catch (err) {
        console.error("خطأ أثناء معالجة وحفظ الدفعة:", err);
        alert(`❌ فشل الاتصال بقاعدة البيانات: ${err.message}`);
    }
}

// إشعار الحفظ الجانبي مع الرنة (بدل نافذة Alert المزعجة)
function showSuccessNotification(message) {
    // تشغيل الرنة
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play().catch(() => {}); // نتجاهل الخطأ إذا منع المتصفح الصوت

    let toast = document.getElementById('success-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'success-toast';
        toast.className = 'fixed top-5 right-5 bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-2xl z-[100] transform transition-all duration-300 translate-x-full opacity-0 flex items-center gap-2 font-bold';
        toast.innerHTML = `<span>✅</span> <span id="toast-message"></span>`;
        document.body.appendChild(toast);
    }
    document.getElementById('toast-message').innerText = message;
    setTimeout(() => { toast.classList.remove('translate-x-full', 'opacity-0'); }, 10);
    setTimeout(() => { toast.classList.add('translate-x-full', 'opacity-0'); }, 3000);
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
                <td class="p-3 text-emerald-600 font-medium">${parseFloat(p.amount_euro).toFixed(2)} $</td>
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

async function saveEditedPayment(event) {
    event.preventDefault();
    const paymentId = document.getElementById('edit-payment-id').value;
    const amountDzd = parseFloat(document.getElementById('edit-amount-dzd').value);
    const amountEuro = parseFloat(document.getElementById('edit-amount-euro').value);
    const date = document.getElementById('edit-payment-date').value;
    const note = document.getElementById('edit-payment-note').value.trim() || 'Versement';

    if (!amountDzd || !amountEuro || !date) {
        alert("يرجى ملء جميع الحقول.");
        return;
    }

    try {
        // 1. تحديث الدفعة في جدول payments
        const { error: paymentError } = await _supabase.from('payments').update({ amount_dzd: amountDzd, amount_euro: amountEuro, date, note }).eq('id', paymentId);
        if (paymentError) throw paymentError;

        // 2. إعادة حساب الأرباح
        const adCapital = parseFloat((amountDzd * 0.8).toFixed(2));
        const totalProfit = parseFloat((amountDzd - adCapital).toFixed(2));
        const companyProfit = parseFloat((totalProfit * 0.30).toFixed(2));
        const myProfit = parseFloat((totalProfit * 0.70).toFixed(2));
        const timestampWithTime = `${date}T12:00:00Z`;

        // 3. تحديث السجل المرتبط في جدول الأرشيف
        const { error: archiveError } = await _supabase.from('profits_archive')
            .update({
                amount_received: amountDzd,
                ad_capital: adCapital,
                total_profit: totalProfit,
                company_profit: companyProfit,
                my_profit: myProfit,
                created_at: timestampWithTime
            })
            .eq('payment_id', paymentId);

        if (archiveError) throw archiveError;

        showSuccessNotification("✅ تم تعديل الدفعة والأرشيف بنجاح!");
        document.getElementById('edit-payment-modal').classList.add('hidden');
        loadAdminData();
        if (typeof loadAnalyticsData === 'function') loadAnalyticsData();

    } catch (error) {
        alert(`❌ فشل التعديل: ${error.message}`);
    }
}

async function deletePayment(paymentId, clientId, clientName) {
    if (!confirm("⚠️ هل أنت متأكد من حذف هذه الدفعة؟ لا يمكن التراجع عن هذا الإجراء!")) return;

    try {
        // 1. حذف من جدول profits_archive أولاً (لأن فيه foreign key)
        const { error: archiveErr } = await _supabase
            .from('profits_archive')
            .delete()
            .eq('payment_id', paymentId);

        if (archiveErr) throw archiveErr;

        // 2. ثم حذف من جدول payments
        const { error: payErr } = await _supabase
            .from('payments')
            .delete()
            .eq('id', paymentId);

        if (payErr) throw payErr;

        showToast("تم حذف الدفعة بنجاح");
        openClientPayments(clientId, clientName);
        loadAdminData();

    } catch (err) {
        console.error("خطأ في الحذف:", err);
        alert("❌ فشل الحذف: " + err.message);
    }
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
        const metaCampaigns = await getAndSyncCampaigns();
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
        const metaCampaigns = await getAndSyncCampaigns();
        let lastCamp = metaCampaigns.find(camp => camp.name.toLowerCase().includes(client.campaign_keyword.toLowerCase()));
        if (lastCamp && lastCamp.insights?.data?.[0]) {
            let spendEuro = parseFloat(lastCamp.insights.data[0].spend || 0);
            let spendDzd = Math.round(spendEuro * (client.exchange_rate || 240));
            speakAndStatus(`تكلفة الإعلان الأخير للزبون ${client.name} المسمى ${lastCamp.name} بلغت ${spendEuro.toFixed(2)} دولار، أي ما يعادل ${spendDzd.toLocaleString('fr-FR')} دينار جزائري.`);
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

// ==========================================
//  التحقق من طلبات التسجيل المعلقة والعداد
// ==========================================
async function checkPendingRequests() {
    try {
        // 1. جلب عدد طلبات التسجيل المعلقة
        const { count: regCount, error: regError } = await _supabase
            .from('clients')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'pending');
            
        // 2. جلب عدد طلبات شحن الرصيد المعلقة
        const { count: payCount, error: payError } = await _supabase
            .from('payment_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
        
        let totalCount = 0;
        if (!regError && regCount !== null) totalCount += regCount;
        if (!payError && payCount !== null) totalCount += payCount;
        
        const badge = document.getElementById('pending-badge');
        if (badge) {
            if (totalCount > 0) {
                badge.innerText = totalCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch (e) {
        console.error("خطأ في التحقق من عدد الطلبات المعلقة:", e);
    }
}