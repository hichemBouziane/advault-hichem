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

    // مستمع إدخال مبلغ الشحن لعرض المعادل بالدينار لحظياً
    const amountInput = document.getElementById('deposit-amount-usd');
    if (amountInput) {
        amountInput.addEventListener('input', () => {
            const usd = parseFloat(amountInput.value) || 0;
            const rate = (user && user.exchange_rate) ? parseInt(user.exchange_rate) : 230;
            const dzd = Math.round(usd * rate);
            document.getElementById('deposit-dzd-preview').innerText = `${dzd.toLocaleString('fr-FR')} دج`;
        });
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

    // تصفية وعرض تفاصيل الحملات النشطة الخاصة بالزبون
    const activeCampaigns = [];
    metaCampaigns.forEach(camp => {
        if (camp.name.toLowerCase().includes(client.campaign_keyword.toLowerCase())) {
            const spend = camp.insights?.data?.[0] ? parseFloat(camp.insights.data[0].spend || 0) : 0;
            if (spend > 0) {
                const fee = spend * 0.20;
                const total = spend + fee;
                activeCampaigns.push({
                    name: camp.name,
                    spend: spend,
                    fee: fee,
                    total: total
                });
            }
        }
    });

    // عكس الترتيب (الأحدث أولاً)
    activeCampaigns.reverse();

    // حفظ الحملات كحالة عامة للتحكم في عرض المزيد/أقل
    window.allActiveCampaigns = activeCampaigns;
    window.campaignsShowAll = false;
    
    // تشغيل دالة العرض
    renderCampaignsList();

    // حفظ المدفوعات كحالة عامة للتحكم في عرض المزيد/أقل
    window.allPayments = payments || [];
    window.paymentsShowAll = false;

    // تشغيل دالة العرض
    renderPaymentsList();
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

// ==========================================
//  قائمة حاسبة الإعلانات الجانبية (Calculator Drawer)
// ==========================================
function openCalculatorDrawer() {
    document.getElementById('calculator-drawer-overlay').classList.remove('hidden');
    document.getElementById('calculator-drawer').classList.remove('-translate-x-full');
    calculateEstimatedBudget(); // تشغيل الحساب المبدئي
}

function closeCalculatorDrawer() {
    document.getElementById('calculator-drawer-overlay').classList.add('hidden');
    document.getElementById('calculator-drawer').classList.add('-translate-x-full');
}

function calculateEstimatedBudget() {
    const campaigns = parseInt(document.getElementById('calc-campaigns').value) || 1;
    const budget = parseFloat(document.getElementById('calc-budget').value) || 5;
    const days = parseInt(document.getElementById('calc-days').value) || 7;

    // تحديث قيم النصوص بجانب المؤشرات
    document.getElementById('calc-campaigns-val').innerText = campaigns;
    document.getElementById('calc-budget-val').innerText = `$${budget}`;
    document.getElementById('calc-days-val').innerText = `${days} ${days === 1 ? 'يوم' : 'أيام'}`;

    // الحسابات
    const netUSD = campaigns * budget * days;
    const feeUSD = netUSD * 0.20; // 20% عمولة المنصة
    const totalUSD = netUSD + feeUSD; // الإجمالي بالدولار
    
    // جلب سعر الصرف للزبون من الجلسة (الافتراضي 230)
    const exchangeRate = (user && user.exchange_rate) ? parseInt(user.exchange_rate) : 230;
    const totalDZD = totalUSD * exchangeRate;

    // تحديث النصوص في كارت الفاتورة
    document.getElementById('calc-net-usd').innerText = `$${netUSD.toFixed(2)}`;
    document.getElementById('calc-fee-usd').innerText = `+ $${feeUSD.toFixed(2)}`;
    document.getElementById('calc-total-usd').innerText = `$${totalUSD.toFixed(2)}`;
    document.getElementById('calc-rate').innerText = `${exchangeRate} دج`;
    document.getElementById('calc-total-dzd').innerText = `${Math.round(totalDZD).toLocaleString('fr-FR')} دج`;
}

// ==========================================
//  دوال عرض وتصفية الحملات الإعلانية مع تجميعها (10 إعلانات كحد أقصى)
// ==========================================
function renderCampaignsList() {
    const campaignsTable = document.getElementById('client-campaigns-table');
    const campaignsCountBadge = document.getElementById('campaigns-count-badge');
    const showMoreContainer = document.getElementById('campaigns-show-more-container');
    const toggleBtn = document.getElementById('campaigns-toggle-btn');

    const totalCount = window.allActiveCampaigns.length;

    if (totalCount === 0) {
        campaignsTable.innerHTML = `
            <tr>
                <td colspan="4" class="p-6 text-center text-gray-400 font-bold">لا توجد حملات إعلانية نشطة مرتبطة بحسابك حالياً.</td>
            </tr>
        `;
        campaignsCountBadge.innerText = `0 حملة`;
        showMoreContainer.classList.add('hidden');
        return;
    }

    campaignsCountBadge.innerText = `${totalCount} ${totalCount === 1 ? 'حملة' : 'حملات'}`;

    // تحديد كم حملة سنعرض (بحد أقصى 10 افتراضياً)
    let displayCount = totalCount;
    if (totalCount > 10 && !window.campaignsShowAll) {
        displayCount = 10;
        showMoreContainer.classList.remove('hidden');
        toggleBtn.innerText = `👁️ عرض المزيد (+${totalCount - 10} حملات إضافية)`;
    } else if (totalCount > 10 && window.campaignsShowAll) {
        showMoreContainer.classList.remove('hidden');
        toggleBtn.innerText = `👁️ عرض أقل`;
    } else {
        showMoreContainer.classList.add('hidden');
    }

    let campaignsHtml = '';
    for (let i = 0; i < displayCount; i++) {
        const camp = window.allActiveCampaigns[i];
        campaignsHtml += `
            <tr class="hover:bg-slate-50/50 transition">
                <td class="p-3 font-bold text-gray-800">${camp.name}</td>
                <td class="p-3 text-center font-semibold text-gray-600">$${camp.spend.toFixed(2)}</td>
                <td class="p-3 text-center font-semibold text-purple-650">+ $${camp.fee.toFixed(2)}</td>
                <td class="p-3 text-left font-black text-purple-700">$${camp.total.toFixed(2)}</td>
            </tr>
        `;
    }
    campaignsTable.innerHTML = campaignsHtml;
}

function toggleCampaignsVisibility() {
    window.campaignsShowAll = !window.campaignsShowAll;
    renderCampaignsList();
}

// ==========================================
//  دوال عرض وتصفية المدفوعات مع تجميعها (10 مدفوعات كحد أقصى)
// ==========================================
function renderPaymentsList() {
    const tbody = document.getElementById('client-payments-table');
    const showMoreContainer = document.getElementById('payments-show-more-container');
    const toggleBtn = document.getElementById('payments-toggle-btn');

    const totalCount = window.allPayments.length;

    if (totalCount === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-400">لا توجد مدفوعات مسجلة بعد</td></tr>';
        showMoreContainer.classList.add('hidden');
        return;
    }

    // تحديد كم دفعة سنعرض (بحد أقصى 10 افتراضياً)
    let displayCount = totalCount;
    if (totalCount > 10 && !window.paymentsShowAll) {
        displayCount = 10;
        showMoreContainer.classList.remove('hidden');
        toggleBtn.innerText = `👁️ عرض المزيد (+${totalCount - 10} مدفوعات إضافية)`;
    } else if (totalCount > 10 && window.paymentsShowAll) {
        showMoreContainer.classList.remove('hidden');
        toggleBtn.innerText = `👁️ عرض أقل`;
    } else {
        showMoreContainer.classList.add('hidden');
    }

    let paymentsHtml = '';
    for (let i = 0; i < displayCount; i++) {
        const p = window.allPayments[i];
        paymentsHtml += `
            <tr class="hover:bg-gray-50 transition">
                <td class="p-3 text-gray-500 text-xs">${p.date}</td>
                <td class="p-3 text-emerald-600 font-bold">${parseFloat(p.amount_euro).toFixed(2)} $</td>
                <td class="p-3 font-bold text-gray-700">${parseFloat(p.amount_dzd).toLocaleString('fr-FR')} دج</td>
                <td class="p-3 text-gray-400 text-xs">${p.note || '-'}</td>
            </tr>`;
    }
    tbody.innerHTML = paymentsHtml;
}

function togglePaymentsVisibility() {
    window.paymentsShowAll = !window.paymentsShowAll;
    renderPaymentsList();
}

// ==========================================
//  إرسال طلب شحن رصيد جديد مع ضغط لقطة الشاشة
// ==========================================
async function compressImageAndGetBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function (event) {
            const img = new Image();
            img.src = event.target.result;
            img.onload = function () {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                resolve(dataUrl);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

async function submitDepositRequest() {
    const amountUsdEl = document.getElementById('deposit-amount-usd');
    const screenshotEl = document.getElementById('deposit-screenshot');
    const submitBtn = document.getElementById('submit-deposit-btn');
    
    const amountUsd = parseFloat(amountUsdEl.value);
    const file = screenshotEl.files[0];
    
    if (isNaN(amountUsd) || amountUsd <= 0) {
        alert("يرجى إدخال مبلغ صحيح بالدولار.");
        return;
    }
    if (!file) {
        alert("يرجى رفع صورة إثبات الدفع (سكرين شوت).");
        return;
    }
    
    submitBtn.disabled = true;
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = "⏳ جاري رفع الطلب...";
    
    try {
        const screenshotBase64 = await compressImageAndGetBase64(file);
        const rate = (user && user.exchange_rate) ? parseInt(user.exchange_rate) : 230;
        const amountDzd = Math.round(amountUsd * rate);
        
        const { error } = await _supabase
            .from('payment_requests')
            .insert([{
                client_id: user.id,
                client_name: user.name || 'زبون تجاري',
                amount_usd: amountUsd,
                amount_dzd: amountDzd,
                screenshot_base64: screenshotBase64,
                status: 'pending'
            }]);
            
        if (error) throw error;
        
        alert("✅ تم إرسال طلب الشحن بنجاح! سيتم مراجعة إثبات الدفع وتأكيده من طرف المسؤول قريباً.");
        closePayModal();
        amountUsdEl.value = '';
        screenshotEl.value = '';
        document.getElementById('deposit-dzd-preview').innerText = '0 دج';
        
    } catch (err) {
        console.error(err);
        alert("❌ فشل إرسال الطلب: " + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}