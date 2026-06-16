const SUPABASE_URL = "https://uljdazwcjxogpymvbflq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DGoBEde67ewtWtMlC4Nx9w_cuvSAmUc";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ضع هنا رقم بطاقتك Redotpay
const REDOTPAY_ID = "ضع_هنا_ID_بطاقتك";

// ===== حد الرصيد المنخفض (بالدينار) =====
const LOW_BALANCE_THRESHOLD = 10000;

// ==========================================
//  جلب الحملات من Supabase مباشرة
// ==========================================
async function getCampaignsFromSupabase() {
    const { data, error } = await _supabase
        .from('facebook_campaigns')
        .select('campaign_name, facebook_spend_euro');
    if (error || !data || data.length === 0) return [];
    return data.map(row => ({
        name:     row.campaign_name,
        insights: { data: [{ spend: row.facebook_spend_euro }] }
    }));
}

// التحقق من تسجيل الدخول
const user = JSON.parse(localStorage.getItem('currentUser'));
if (!user || user.role !== 'client') {
    window.location.href = 'index.html';
}
document.getElementById('user-welcome').innerText = `مرحباً، ${user.name}`;

// ==========================================
//  تحديث بطاقة الرصيد حسب الحالة
// ==========================================
function updateBalanceCard(finalDebtDzd, exchangeRate) {
    const card       = document.getElementById('balance-card');
    const amountEl   = document.getElementById('balance-amount');
    const messageEl  = document.getElementById('balance-message');
    const payBtn     = document.getElementById('pay-btn');

    // تنسيق الرقم
    const formatted = Math.abs(finalDebtDzd).toLocaleString('fr-FR', { maximumFractionDigits: 0 });

    // حالة 1: رصيد سالب (مديون)
    if (finalDebtDzd > 0) {
        card.className      = 'balance-card-red mx-4 mt-5 rounded-3xl p-6 text-white text-center shadow-xl relative overflow-hidden transition-all duration-500';
        amountEl.innerText  = `- ${formatted} دج`;
        messageEl.innerHTML = '⚠️ لديك مستحقات متأخرة، يرجى التسوية';
        payBtn.classList.remove('hidden');
        payBtn.className    = 'bg-white text-red-600 font-bold px-6 py-2.5 rounded-2xl text-sm shadow-lg hover:bg-red-50 transition cursor-pointer';

    // حالة 2: رصيد منخفض أو صفر قريباً
    } else if (finalDebtDzd < 0 && Math.abs(finalDebtDzd) < LOW_BALANCE_THRESHOLD) {
        card.className      = 'balance-card-orange mx-4 mt-5 rounded-3xl p-6 text-white text-center shadow-xl relative overflow-hidden transition-all duration-500';
        amountEl.innerText  = `${formatted} دج`;
        messageEl.innerHTML = '📉 رصيدك المتبقي منخفض، جدده قريباً';
        payBtn.classList.add('hidden');

    // حالة 3: حساب نظيف / رصيد مريح
    } else {
        card.className      = 'balance-card-purple mx-4 mt-5 rounded-3xl p-6 text-white text-center shadow-xl relative overflow-hidden transition-all duration-500';
        amountEl.innerText  = finalDebtDzd === 0 ? '0 دج ✅' : `${formatted} دج ✅`;
        messageEl.innerHTML = '✅ حسابك نظيف، شكراً لك!';
        payBtn.classList.add('hidden');
    }

    // إضافة نقاط الخلفية إذا اختفت
    if (!card.querySelector('.dots-pattern')) {
        const dots = document.createElement('div');
        dots.className = 'dots-pattern';
        card.prepend(dots);
    }

    // تحديث نافذة الدفع
    const absDzd   = Math.abs(finalDebtDzd);
    const usdAmount = (absDzd / (exchangeRate || 240)).toFixed(2);
    document.getElementById('modal-balance').innerHTML = `
        <span class="text-2xl font-bold text-red-600">${absDzd.toLocaleString('fr-FR')} دج</span>
        <span class="block text-sm font-semibold text-gray-400 mt-1">≈ ${usdAmount} $</span>
    `;
    document.getElementById('redotpay-id').innerText   = REDOTPAY_ID;
}

// ==========================================
//  تحميل بيانات الزبون الكاملة
// ==========================================
async function loadClientData(client) {
    const metaCampaigns = await getCampaignsFromSupabase();

    // حساب المصاريف حسب الكلمة المفتاحية
    let totalSpendEuro = 0;
    metaCampaigns.forEach(camp => {
        if (camp.name.toLowerCase().includes(client.campaign_keyword.toLowerCase())) {
            if (camp.insights?.data?.[0]) {
                totalSpendEuro += parseFloat(camp.insights.data[0].spend || 0);
            }
        }
    });

    // فائدة الوكالة 20%
    const totalSpendWithProfit = totalSpendEuro * 1.2;

    // جلب المدفوعات من Supabase
    let { data: payments } = await _supabase
        .from('payments')
        .select('*')
        .eq('client_id', client.id)
        .order('date', { ascending: false });

    let totalPaidEuro = payments?.reduce((sum, item) => sum + parseFloat(item.amount_euro || 0), 0) || 0;

    // حساب الرصيد بالدينار
    let remainingEuro  = totalSpendWithProfit - totalPaidEuro;
    let finalDebtDzd   = Math.round(remainingEuro * (client.exchange_rate || 240));

    // تحديث بطاقة الرصيد
    updateBalanceCard(finalDebtDzd, client.exchange_rate || 240);

    // تحديث البطاقات الإحصائية
    document.getElementById('client-total-ads').innerText  = `${totalSpendWithProfit.toFixed(2)} €`;
    document.getElementById('client-total-paid').innerText = `${totalPaidEuro.toFixed(2)} €`;

    // تحديث جدول المدفوعات
    const tbody = document.getElementById('client-payments-table');
    tbody.innerHTML = '';

    if (!payments || payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-400">لا توجد مدفوعات مسجلة بعد</td></tr>';
        return;
    }

    payments.forEach(p => {
        tbody.innerHTML += `
            <tr class="hover:bg-gray-50 transition">
                <td class="p-3 text-gray-500 text-xs">${p.date}</td>
                <td class="p-3 text-emerald-600 font-bold">${parseFloat(p.amount_euro).toFixed(2)} €</td>
                <td class="p-3 font-bold text-gray-700">${parseFloat(p.amount_dzd).toLocaleString('fr-FR')} دج</td>
                <td class="p-3 text-gray-400 text-xs">${p.note || '-'}</td>
            </tr>`;
    });
}

// ==========================================
//  نافذة الدفع
// ==========================================
function openPayModal() {
    document.getElementById('pay-modal').classList.remove('hidden');
}

function closePayModal() {
    document.getElementById('pay-modal').classList.add('hidden');
}

function copyRedotpayId() {
    const id = document.getElementById('redotpay-id').innerText;
    navigator.clipboard.writeText(id).then(() => {
        const btn = event.target;
        btn.innerText = '✅ تم النسخ!';
        setTimeout(() => { btn.innerText = '📋 نسخ الـ ID'; }, 2000);
    });
}

// ==========================================
//  تسجيل الخروج
// ==========================================
function handleLogout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

// تشغيل عند فتح الصفحة
loadClientData(user);