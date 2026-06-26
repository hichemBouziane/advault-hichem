const SUPABASE_URL = "https://uljdazwcjxogpymvbflq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DGoBEde67ewtWtMlC4Nx9w_cuvSAmUc";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ضع هنا رقم بطاقتك Redotpay
const REDOTPAY_ID = "1999499801";

// ===== حد الرصيد المنخفض (بالدينار) =====
const LOW_BALANCE_THRESHOLD = 10000;

// التحقق من تسجيل الدخول فوراً عند فتح السكريبت
const user = JSON.parse(localStorage.getItem('currentUser'));
if (!user || user.role !== 'client') {
    window.location.href = 'index.html';
}

// تشغيل النظام بالكامل بأمان بعد تحميل المتصفح وعناصر الـ HTML
document.addEventListener('DOMContentLoaded', () => {
    if (user && user.name) {
        document.getElementById('user-welcome').innerText = `مرحباً، ${user.name}`;
        loadClientData(user);
    }
});

// ==========================================
// 🌍 جلب الموقع الجغرافي الحقيقي للزائر
// يجرب 3 APIs بالتسلسل — إذا فشل الأول ينتقل للتالي
// ==========================================
async function getVisitorLocation() {

    // --- API 1: ip-api.com (بدون مفتاح، سريع، يدعم HTTP و HTTPS) ---
    try {
        const res  = await fetch('https://ip-api.com/json/?fields=status,city,country,countryCode', { cache: 'no-store' });
        const data = await res.json();
        if (data.status === 'success' && data.city) {
            return `${data.city}, ${data.countryCode}`;
        }
    } catch (_) {}

    // --- API 2: ipwho.is ---
    try {
        const res  = await fetch('https://ipwho.is/', { cache: 'no-store' });
        const data = await res.json();
        if (data.success && data.city) {
            return `${data.city}, ${data.country_code}`;
        }
    } catch (_) {}

    // --- API 3: ipapi.co ---
    try {
        const res  = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
        const data = await res.json();
        if (data.city && data.country) {
            return `${data.city}, ${data.country}`;
        }
    } catch (_) {}

    return 'غير محدد';
}

// ==========================================
// 🚀 نظام التتبع التلقائي لزيارات ونشاط العميل
// ==========================================
async function logClientVisit(client) {
    if (!client || !client.id) return;
    try {
        // جلب الموقع أولاً ثم تسجيل الزيارة مع الموقع دفعة واحدة
        const location = await getVisitorLocation();

        const { error } = await _supabase
            .from('user_logs')
            .insert([{
                user_id:   client.id,
                user_name: client.name || 'تاجر جملة',
                action:    'زيارة لوحة التحكم',
                page_url:  window.location.href,
                location:  location
            }]);

        if (error) console.error("❌ خطأ أثناء تسجيل نشاط العميل:", error.message);
    } catch (e) {
        console.error("❌ حدث خطأ غير متوقع في نظام التتبع:", e);
    }
}

// ==========================================
//  جلب الحملات من Supabase مباشرة
// ==========================================
async function getCampaignsFromSupabase() {
    const { data, error } = await _supabase
        .from('facebook_campaigns')
        .select('campaign_name, facebook_spend_euro');
    if (error || !data || data.length === 0) return [];
    return data.map(row => ({
        name: row.campaign_name,
        insights: { data: [{ spend: row.facebook_spend_euro }] }
    }));
}

// ==========================================
//  تحديث بطاقة الرصيد حسب الحالة
// ==========================================
function updateBalanceCard(finalDebtDzd, exchangeRate) {
    const card      = document.getElementById('balance-card');
    const amountEl  = document.getElementById('balance-amount');
    const messageEl = document.getElementById('balance-message');
    const payBtn    = document.getElementById('pay-btn');

    const formatted = Math.abs(finalDebtDzd).toLocaleString('fr-FR', { maximumFractionDigits: 0 });

    if (finalDebtDzd > 0) {
        card.className      = 'balance-card-red mx-4 mt-5 rounded-3xl p-6 text-white text-center shadow-xl relative overflow-hidden transition-all duration-500';
        amountEl.innerText  = `- ${formatted} دج`;
        messageEl.innerHTML = '⚠️ لديك مستحقات متأخرة، يرجى التسوية';
        payBtn.classList.remove('hidden');
        payBtn.className    = 'bg-white text-red-600 font-bold px-6 py-2.5 rounded-2xl text-sm shadow-lg hover:bg-red-50 transition cursor-pointer';

    } else if (finalDebtDzd < 0 && Math.abs(finalDebtDzd) < LOW_BALANCE_THRESHOLD) {
        card.className      = 'balance-card-orange mx-4 mt-5 rounded-3xl p-6 text-white text-center shadow-xl relative overflow-hidden transition-all duration-500';
        amountEl.innerText  = `${formatted} دج`;
        messageEl.innerHTML = '📉 رصيدك المتبقي منخفض، جدده قريباً';
        payBtn.classList.add('hidden');

    } else {
        card.className      = 'balance-card-purple mx-4 mt-5 rounded-3xl p-6 text-white text-center shadow-xl relative overflow-hidden transition-all duration-500';
        amountEl.innerText  = finalDebtDzd === 0 ? '0 دج ✅' : `${formatted} دج ✅`;
        messageEl.innerHTML = '✅ حسابك نظيف، شكراً لك!';
        payBtn.classList.add('hidden');
    }

    if (!card.querySelector('.dots-pattern')) {
        const dots = document.createElement('div');
        dots.className = 'dots-pattern';
        card.prepend(dots);
    }

    const absDzd    = Math.abs(finalDebtDzd);
    const usdAmount = (absDzd / (exchangeRate || 240)).toFixed(2);
    document.getElementById('modal-balance').innerHTML = `
        <span class="text-2xl font-bold text-red-600">${absDzd.toLocaleString('fr-FR')} دج</span>
        <span class="block text-sm font-semibold text-gray-400 mt-1">≈ ${usdAmount} $</span>
    `;
    document.getElementById('redotpay-id').innerText = REDOTPAY_ID;
}

// ==========================================
//  تحميل بيانات الزبون الكاملة
// ==========================================
async function loadClientData(client) {
    await logClientVisit(client);

    const metaCampaigns = await getCampaignsFromSupabase();

    let totalSpendEuro = 0;
    metaCampaigns.forEach(camp => {
        if (camp.name.toLowerCase().includes(client.campaign_keyword.toLowerCase())) {
            if (camp.insights?.data?.[0]) {
                totalSpendEuro += parseFloat(camp.insights.data[0].spend || 0);
            }
        }
    });

    const totalSpendWithProfit = totalSpendEuro * 1.2;

    let { data: payments } = await _supabase
        .from('payments')
        .select('*')
        .eq('client_id', client.id)
        .order('date', { ascending: false });

    let totalPaidEuro  = payments?.reduce((sum, item) => sum + parseFloat(item.amount_euro || 0), 0) || 0;
    let remainingEuro  = totalSpendWithProfit - totalPaidEuro;
    let finalDebtDzd   = Math.round(remainingEuro * (client.exchange_rate || 240));

    updateBalanceCard(finalDebtDzd, client.exchange_rate || 240);

    document.getElementById('client-total-ads').innerText  = `${totalSpendWithProfit.toFixed(2)} $`;
    document.getElementById('client-total-paid').innerText = `${totalPaidEuro.toFixed(2)} $`;

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
                <td class="p-3 text-emerald-600 font-bold">${parseFloat(p.amount_euro).toFixed(2)} $</td>
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

function copyRedotpayId(event) {
    const id = document.getElementById('redotpay-id').innerText;
    navigator.clipboard.writeText(id).then(() => {
        const btn          = event ? event.target : document.querySelector('[onclick^="copyRedotpayId"]');
        const originalText = btn.innerText;
        btn.innerText      = '✅ تم النسخ!';
        setTimeout(() => { btn.innerText = originalText; }, 2000);
    });
}

// ==========================================
//  تسجيل الخروج
// ==========================================
function handleLogout() {
    localStorage.clear();
    window.location.href = 'index.html';
}