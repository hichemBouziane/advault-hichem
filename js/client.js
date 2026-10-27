const SUPABASE_URL = "https://uljdazwcjxogpymvbflq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DGoBEde67ewtWtMlC4Nx9w_cuvSAmUc";

const localUser = JSON.parse(localStorage.getItem('currentUser'));
const headers = {};
if (localUser && localUser.session_token) {
    headers['x-session-token'] = localUser.session_token;
}
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers }
});

function isKeywordMatched(campaignName, keyword) {
    if (!campaignName || !keyword) return false;
    const cleanKeyword = keyword.trim();
    if (!cleanKeyword) return false;
    const escaped = cleanKeyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const isAscii = /^[a-zA-Z0-9_-]+$/.test(cleanKeyword);
    const pattern = isAscii ? '\\b' + escaped + '\\b' : '(?:^|\\s|[.,_\\-/])' + escaped + '(?:$|\\s|[.,_\\-/])';
    const regex = new RegExp(pattern, 'i');
    return regex.test(campaignName);
}

// ضع هنا رقم بطاقتك Redotpay
const REDOTPAY_ID = "1999499801";

// ===== حد الرصيد المنخفض (بالدينار) =====
const LOW_BALANCE_THRESHOLD = 10000;

// إدارة الجلسة ودعم الرابط السحري المباشر
let user = JSON.parse(localStorage.getItem('currentUser'));

async function initClientSession() {
    const urlParams = new URLSearchParams(window.location.search);
    const magicToken = urlParams.get('token');

    // 1. إذا تم الدخول عبر الرابط السحري
    if (magicToken) {
        try {
            const { data, error } = await _supabase
                .from('clients')
                .select('*')
                .eq('magic_token', magicToken)
                .maybeSingle();

            if (data && data.role === 'client') {
                user = data;
                localStorage.setItem('currentUser', JSON.stringify(user));
                // إخفاء التوكن من شريط العنوان لحماية الخصوصية ومظهر احترافي
                window.history.replaceState({}, document.title, window.location.pathname);
            } else {
                console.warn("⚠️ الرابط السحري غير صالح أو الحساب غير موجود.");
            }
        } catch (err) {
            console.error("❌ خطأ أثناء فحص الرابط السحري:", err);
        }
    }

    // 2. فحص أمان تسجيل الدخول (إذا لم يكن مسجلاً يعاد لصفحة الدخول)
    if (!user || user.role !== 'client') {
        window.location.href = 'index.html';
        return;
    }

    // 3. تهيئة واجهة المستخدم وتحميل البيانات
    if (user && user.name) {
        const welcomeEl = document.getElementById('user-welcome');
        if (welcomeEl) welcomeEl.innerText = `مرحباً، ${user.name}`;
        loadClientData(user);
    }

    // مستمع إدخال مبلغ الشحن لعرض المعادل بالدينار لحظياً
    const amountInput = document.getElementById('deposit-amount-usd');
    if (amountInput) {
        amountInput.addEventListener('input', () => {
            const usd = parseFloat(amountInput.value) || 0;
            const rate = (user && user.exchange_rate) ? parseInt(user.exchange_rate) : 230;
            const dzd = Math.round(usd * rate);
            const previewEl = document.getElementById('deposit-dzd-preview');
            if (previewEl) previewEl.innerText = `${dzd.toLocaleString('fr-FR')} دج`;
        });
    }
}

// تشغيل النظام بعد تحميل المتصفح وعناصر الـ HTML
document.addEventListener('DOMContentLoaded', () => {
    initClientSession();
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
function updateBalanceCard(finalBalanceUsd, exchangeRate) {
    const card      = document.getElementById('balance-card');
    const amountEl  = document.getElementById('balance-amount');
    const messageEl = document.getElementById('balance-message');
    const payBtn    = document.getElementById('pay-btn');

    // احتساب المعادل بالدينار الجزائري
    const finalBalanceDzd = Math.round(finalBalanceUsd * exchangeRate);
    const absDzd = Math.abs(finalBalanceDzd);
    const absUsd = Math.abs(finalBalanceUsd);

    const formattedDzd = absDzd.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + " دج";
    const formattedUsd = absUsd.toFixed(2) + " $";

    // إذا كان الرصيد بالدولار سالباً، فهذا يعني أن العميل مدين (يجب عليه الدفع)
    if (finalBalanceUsd < 0) {
        card.className      = 'balance-card-red mx-4 mt-5 rounded-3xl p-6 text-white text-center shadow-xl relative overflow-hidden transition-all duration-500';
        amountEl.innerHTML  = `
            <div class="text-3xl font-extrabold">- ${formattedDzd}</div>
            <div class="text-sm font-semibold opacity-80 mt-1">≈ - ${formattedUsd}</div>
        `;
        messageEl.innerHTML = '⚠️ لديك مستحقات متأخرة، يرجى التسوية';
        payBtn.classList.remove('hidden');
        payBtn.className    = 'bg-white text-red-600 font-bold px-6 py-2.5 rounded-2xl text-sm shadow-lg hover:bg-red-50 transition cursor-pointer';
    } else if (finalBalanceUsd > 0 && finalBalanceDzd < LOW_BALANCE_THRESHOLD) {
        // رصيد موجب منخفض
        card.className      = 'balance-card-orange mx-4 mt-5 rounded-3xl p-6 text-white text-center shadow-xl relative overflow-hidden transition-all duration-500';
        amountEl.innerHTML  = `
            <div class="text-3xl font-extrabold">+ ${formattedDzd}</div>
            <div class="text-sm font-semibold opacity-80 mt-1">≈ + ${formattedUsd}</div>
        `;
        messageEl.innerHTML = '📉 رصيدك المتبقي منخفض، جدده قريباً';
        payBtn.classList.add('hidden');
    } else {
        // رصيد موجب كافي
        card.className      = 'balance-card-purple mx-4 mt-5 rounded-3xl p-6 text-white text-center shadow-xl relative overflow-hidden transition-all duration-500';
        amountEl.innerHTML  = `
            <div class="text-3xl font-extrabold">+ ${formattedDzd}</div>
            <div class="text-sm font-semibold opacity-80 mt-1">≈ + ${formattedUsd}</div>
        `;
        messageEl.innerHTML = '✅ رصيدك متوفر وجاهز للاستخدام';
        payBtn.classList.add('hidden');
    }

    if (!card.querySelector('.dots-pattern')) {
        const dots = document.createElement('div');
        dots.className = 'dots-pattern';
        card.prepend(dots);
    }

    // حفظ المبالغ لشاشة الشحن المنفصلة
    localStorage.setItem('recharge_absDzd', absDzd);
    localStorage.setItem('recharge_usdAmount', absUsd.toFixed(2));

    const modalBalanceEl = document.getElementById('modal-balance');
    if (modalBalanceEl) {
        modalBalanceEl.innerHTML = `
            <span class="text-2xl font-bold text-red-600">${absDzd.toLocaleString('fr-FR')} دج</span>
            <span class="block text-sm font-semibold text-gray-400 mt-1">≈ ${absUsd.toFixed(2)} $</span>
        `;
    }
    const redotpayIdEl = document.getElementById('redotpay-id');
    if (redotpayIdEl) {
        redotpayIdEl.innerText = REDOTPAY_ID;
    }
}

// ==========================================
//  تحميل بيانات الزبون الكاملة
// ==========================================
async function loadClientData(client) {
    // جلب أحدث بيانات للزبون من قاعدة البيانات لضمان دقة الصلاحيات والرصيد وسعر الصرف
    let activeClient = client;
    try {
        const { data: latestClient, error: fetchErr } = await _supabase
            .from('clients')
            .select('*')
            .eq('id', client.id)
            .single();
            
        if (!fetchErr && latestClient) {
            activeClient = latestClient;
            localStorage.setItem('currentUser', JSON.stringify(latestClient));
        }
    } catch (e) {
        console.error("خطأ في جلب بيانات العميل المحدثة:", e);
    }

    await logClientVisit(activeClient);

    const metaCampaigns = await getCampaignsFromSupabase();

    let totalSpendEuro = 0;
    metaCampaigns.forEach(camp => {
        if (isKeywordMatched(camp.name, activeClient.campaign_keyword)) {
            if (camp.insights?.data?.[0]) {
                totalSpendEuro += parseFloat(camp.insights.data[0].spend || 0);
            }
        }
    });

    const totalSpendWithProfit = totalSpendEuro * 1.2;

    let { data: payments } = await _supabase
        .from('payments')
        .select('*')
        .eq('client_id', activeClient.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });

    if (payments && payments.length > 0) {
        payments.sort((a, b) => {
            const timeA = new Date(a.created_at || a.date || 0).getTime();
            const timeB = new Date(b.created_at || b.date || 0).getTime();
            if (timeB !== timeA) return timeB - timeA;
            return (b.id || '').localeCompare(a.id || '');
        });
    }

    // جلب تكاليف الخدمات النشطة والمعلقة لتعليقها من رصيد الزبون المتاح
    let { data: serviceRequests } = await _supabase
        .from('service_requests')
        .select('price_usd')
        .eq('client_id', activeClient.id)
        .eq('status', 'pending');

    let totalServicesCostUsd = serviceRequests?.reduce((sum, item) => sum + parseFloat(item.price_usd || 0), 0) || 0;
    let totalPaidEuro  = payments?.reduce((sum, item) => sum + parseFloat(item.amount_euro || 0), 0) || 0;
    
    // سعر الصرف الافتراضي 260 دج في حال عدم تعيين قيمة مخصصة
    const exchangeRate = activeClient.exchange_rate || 260;

    // رصيد الإعلانات الصافي (المدفوع - المستهلك)
    let adsBalanceUsd = totalPaidEuro - totalSpendWithProfit;

    // الرصيد النهائي المتوفر بالدولار بعد تعليق/خصم مبالغ الخدمات
    let finalBalanceUsd = adsBalanceUsd - totalServicesCostUsd;

    window.currentClientFinalDebtDzd = -Math.round(finalBalanceUsd * exchangeRate); // القيمة المعروضة للدين
    window.currentClientExchangeRate = exchangeRate;

    updateBalanceCard(finalBalanceUsd, exchangeRate);

    document.getElementById('client-total-ads').innerText  = `${totalSpendWithProfit.toFixed(2)} $`;
    document.getElementById('client-total-paid').innerText = `${totalPaidEuro.toFixed(2)} $`;

    // تصفية وعرض تفاصيل الحملات النشطة الخاصة بالزبون
    const activeCampaigns = [];
    metaCampaigns.forEach(camp => {
        if (isKeywordMatched(camp.name, activeClient.campaign_keyword)) {
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

    // التحكم في ظهور وإخفاء جدول الحملات الإعلانية النشطة
    const campaignsSection = document.getElementById('client-campaigns-section');
    if (campaignsSection) {
        if (activeClient.show_campaigns_table !== false) {
            campaignsSection.classList.remove('hidden');
        } else {
            campaignsSection.classList.add('hidden');
        }
    }

    // التحكم في ظهور وإخفاء جدول سجل المدفوعات السابقة
    const paymentsSection = document.getElementById('client-payments-section');
    if (paymentsSection) {
        if (activeClient.show_payments_table !== false) {
            paymentsSection.classList.remove('hidden');
        } else {
            paymentsSection.classList.add('hidden');
        }
    }

    // تحميل وتتبع طلبات الخدمات والاشتراكات للزبون
    await loadClientServiceRequests(activeClient);

    // تحميل وعرض كشف الحساب المالي للمحفظة
    await loadClientWalletLedger(activeClient);

    // تشغيل محرك إشعارات الهاتف الذكية (الحد الأدنى + تأخر الدفع + تنبيهات الأدمن الفورية)
    if (typeof window.initClientSmartNotifications === 'function') {
        window.initClientSmartNotifications(activeClient, finalBalanceUsd, exchangeRate);
    }
}

// ==========================================
//  تحميل وعرض كشف الحساب المالي للمحفظة
// ==========================================
async function loadClientWalletLedger(client) {
    try {
        const { data: txs, error } = await _supabase
            .from('wallet_transactions')
            .select('*')
            .eq('client_id', client.id)
            .order('created_at', { ascending: false });

        const tbody = document.getElementById('client-ledger-table-body');
        if (!tbody) return;

        if (error || !txs || txs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="p-4 text-center text-gray-400 font-bold">لا توجد معاملات مسجلة في كشف حساب المحفظة حالياً.</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = '';
        txs.forEach(tx => {
            const date = new Date(tx.created_at).toLocaleDateString('ar-DZ', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            let typeBadge = '';
            let amountClass = '';
            let prefix = '';

            if (tx.type === 'payment') {
                typeBadge = '<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">شحن رصيد</span>';
                amountClass = 'text-emerald-600 font-bold';
                prefix = '+';
            } else if (tx.type === 'refund') {
                typeBadge = '<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-bold">استرجاع</span>';
                amountClass = 'text-blue-600 font-bold';
                prefix = '+';
            } else if (tx.type === 'service_escrow') {
                typeBadge = '<span class="bg-red-100 text-red-800 px-2 py-0.5 rounded text-[10px] font-bold">خصم / حجز</span>';
                amountClass = 'text-red-600 font-bold';
                prefix = '';
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="p-3 text-gray-500 whitespace-nowrap">${date}</td>
                <td class="p-3">${typeBadge}</td>
                <td class="p-3 text-gray-700">${tx.description || ''}</td>
                <td class="p-3 text-left ${amountClass}">${prefix}${parseFloat(tx.amount).toFixed(2)} $</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("خطأ في تحميل كشف الحساب:", e);
    }
}

// ==========================================
//  نافذة الدفع
// ==========================================
function openPayModal() {
    window.location.href = 'recharge.html';
}

function closePayModal() {
    // لم تعد مستخدمة بعد فصل الصفحة
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
                <td class="p-3 text-gray-400 text-xs">
                    <div class="flex items-center justify-between gap-1">
                        <span>${p.note || '-'}</span>
                        <button onclick="downloadPDFReceipt('${p.id}', '${p.date}', ${p.amount_euro}, ${p.amount_dzd}, '${p.note || ''}')"
                            class="bg-purple-50 hover:bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-1 rounded-lg transition cursor-pointer flex items-center gap-1">
                            📄 فاتورة
                        </button>
                    </div>
                </td>
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
        showToast("يرجى إدخال مبلغ صحيح بالدولار.", "error");
        return;
    }
    if (!file) {
        showToast("يرجى رفع صورة إثبات الدفع (سكرين شوت).", "error");
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
        
        // إرسال تنبيه للأدمن بتليجرام
        const telegramMessage = `💰 طلب شحن رصيد جديد معلق:
👤 الزبون: ${user.name || 'زبون تجاري'}
💵 المبلغ: $${amountUsd}
💵 المقابل بالدينار: ${amountDzd.toLocaleString('fr-FR')} دج
يرجى مراجعة إثبات الدفع وقبوله من لوحة التحكم.`;
        await sendTelegramNotification(telegramMessage);
        
        showToast("تم إرسال طلب الشحن بنجاح! سيتم مراجعة إثبات الدفع وتأكيده من طرف المسؤول قريباً.", "success");
        closePayModal();
        amountUsdEl.value = '';
        screenshotEl.value = '';
        document.getElementById('deposit-dzd-preview').innerText = '0 دج';
        
    } catch (err) {
        console.error(err);
        showToast("فشل إرسال الطلب: " + err.message, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

async function sendTelegramNotification(text) {
    const BOT_TOKEN = "8636070898:AAFA5OZwJ81WqVvC9TfaudmOjLKV4r43tcM";
    const CHAT_ID = "1746721547";
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(text)}`;
    try {
        await fetch(url);
    } catch (e) {
        console.error("Failed to send Telegram alert:", e);
    }
}

// ==========================================
//  دالة إظهار التنبيهات المخصصة الجميلة (Toast Notifications)
// ==========================================
function showToast(message, type = 'success') {
    // إنشاء عنصر التنبيه
    const toast = document.createElement('div');
    toast.className = `fixed top-5 right-5 z-50 flex items-center gap-3 bg-white shadow-2xl rounded-2xl p-4 border-r-4 ${type === 'success' ? 'border-emerald-500' : 'border-red-500'} max-w-xs transform translate-x-80 opacity-0 transition-all duration-300 ease-out text-right`;
    
    toast.innerHTML = `
        <div class="text-2xl">${type === 'success' ? '✅' : '❌'}</div>
        <div class="flex-1">
            <h4 class="font-bold text-xs text-gray-800">${type === 'success' ? 'تمت العملية بنجاح' : 'تنبيه'}</h4>
            <p class="text-[10px] text-gray-500 mt-0.5 leading-normal">${message}</p>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // تشغيل نغمة صوتية تفاعلية خفيفة
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(type === 'success' ? 880 : 440, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(type === 'success' ? 1100 : 330, ctx.currentTime + 0.1);
        g.gain.setValueAtTime(0.15, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        o.start(ctx.currentTime);
        o.stop(ctx.currentTime + 0.3);
    } catch (_) {}

    // حركة الدخول (Slide In)
    setTimeout(() => {
        toast.classList.remove('translate-x-80', 'opacity-0');
    }, 50);
    
    // حركة الخروج والحذف (Slide Out & Remove)
    setTimeout(() => {
        toast.classList.add('translate-x-80', 'opacity-0');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4500);
}

// ==========================================
//  التحكم بالقائمة الجانبية والتبويبات
// ==========================================
window.toggleSidebar = function() {
    const drawer = document.getElementById('sidebar-drawer');
    const overlay = document.getElementById('sidebar-overlay');
    if (!drawer) return;
    
    const isOpen = !drawer.classList.contains('translate-x-full');
    if (isOpen) {
        drawer.classList.add('translate-x-full');
        overlay.classList.add('hidden');
    } else {
        drawer.classList.remove('translate-x-full');
        overlay.classList.remove('hidden');
    }
};

window.switchClientTab = function(tabName) {
    const dashboardContent = document.getElementById('tab-dashboard-content');
    const subscriptionsContent = document.getElementById('tab-subscriptions-content');
    const settingsContent = document.getElementById('tab-settings-content');
    const supportContent = document.getElementById('tab-support-content');
    
    dashboardContent.classList.remove('block');
    dashboardContent.classList.add('hidden');
    subscriptionsContent.classList.remove('block');
    subscriptionsContent.classList.add('hidden');
    if (settingsContent) {
        settingsContent.classList.remove('block');
        settingsContent.classList.add('hidden');
    }
    if (supportContent) {
        supportContent.classList.remove('block');
        supportContent.classList.add('hidden');
    }
    
    if (tabName === 'dashboard') {
        dashboardContent.classList.remove('hidden');
        dashboardContent.classList.add('block');
    } else if (tabName === 'subscriptions') {
        subscriptionsContent.classList.remove('hidden');
        subscriptionsContent.classList.add('block');
    } else if (tabName === 'settings') {
        if (settingsContent) {
            settingsContent.classList.remove('hidden');
            settingsContent.classList.add('block');
            checkClientTelegramStatus();
        }
    } else if (tabName === 'support') {
        if (supportContent) {
            supportContent.classList.remove('hidden');
            supportContent.classList.add('block');
            loadClientTickets();
        }
    }
    
    // إغلاق القائمة الجانبية بعد الاختيار
    window.toggleSidebar();
};

// ==========================================
//  إرسال إشعار تليجرام للأدمن
// ==========================================
async function sendTelegramNotification(text) {
    const BOT_TOKEN = "8636070898:AAFA5OZwJ81WqVvC9TfaudmOjLKV4r43tcM";
    const CHAT_ID = "1746721547";
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    try {
        await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: CHAT_ID, text: text })
        });
    } catch (e) {
        console.error("Failed to send telegram notification:", e);
    }
}

// ==========================================
//  طلب تفعيل الاشتراك في الباقات
// ==========================================
window.requestSubscription = async function(tier, priceDzd, viewsText, days) {
    const localUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!localUser || !localUser.id) {
        showToast("يرجى تسجيل الدخول أولاً.", "error");
        return;
    }

    const debt = window.currentClientFinalDebtDzd || 0;
    const balance = debt < 0 ? Math.abs(debt) : 0;

    if (debt >= 0 || balance < priceDzd) {
        showToast(`⚠️ عذراً، رصيدك الحالي (${balance.toLocaleString('fr-FR')} دج) غير كافٍ للاشتراك في هذه الباقة التي تتطلب ${priceDzd.toLocaleString('fr-FR')} دج. يرجى شحن الرصيد أولاً!`, "error");
        return;
    }

    const confirmReq = confirm(`هل أنت متأكد من رغبتك في الاشتراك في باقة:\n[باقة ${tier} - ${priceDzd} دج (${viewsText} / ${days} أيام)]؟\nسيتم إرسال طلب للأدمن وسيتم خصم المبلغ من رصيدك عند التفعيل.`);
    if (!confirmReq) return;

    try {
        const priceUsd = parseFloat((priceDzd / (window.currentClientExchangeRate || 240)).toFixed(2));
        
        const { error } = await _supabase
            .from('service_requests')
            .insert([{
                client_id: localUser.id,
                client_name: localUser.name || 'زبون تجاري',
                service_title: `باقة ${tier}: ${priceDzd} دج - ${viewsText} (${days} أيام)`,
                price_usd: priceUsd,
                status: 'pending'
            }]);

        if (error) throw error;

        const telegramMessage = `الزبون ${localUser.name || 'زبون تجاري'} عمل باقة جديدة (باقة ${tier} - ${viewsText}) ادخل لقبولها`;
        await sendTelegramNotification(telegramMessage);

        showToast("تم إرسال طلب الاشتراك بنجاح! سيقوم الأدمن بمراجعته وتفعيله قريباً.", "success");
        
        setTimeout(() => {
            switchClientTab('dashboard');
            loadClientData(localUser);
        }, 1500);

    } catch (err) {
        console.error("خطأ أثناء إرسال طلب الاشتراك:", err);
        showToast("فشل إرسال طلب الاشتراك: " + err.message, "error");
    }
}

// ==========================================
//  نظام تتبع طلبات الخدمات والاشتراكات للزبون
// ==========================================
async function loadClientServiceRequests(activeClient) {
    const tableBody = document.getElementById('client-requests-table-body');
    const badge = document.getElementById('client-requests-count-badge');
    if (!tableBody) return;

    try {
        const { data, error } = await _supabase
            .from('service_requests')
            .select('*')
            .eq('client_id', activeClient.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const reqs = data || [];
        badge.innerText = `${reqs.length} طلب`;

        if (reqs.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="p-4 text-center text-gray-400 font-bold">لا توجد طلبات خدمات نشطة حالياً.</td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = '';
        reqs.forEach(r => {
            // صياغة التاريخ
            let expectedDelivery = '-';
            let isDelayed = false;
            if (r.due_at) {
                const dueDate = new Date(r.due_at);
                expectedDelivery = dueDate.toLocaleDateString('ar-DZ', { day: 'numeric', month: 'short' });
                
                // فحص التأخير
                if (r.status === 'in_progress' && new Date() > dueDate) {
                    isDelayed = true;
                }
            }

            // صياغة شارة الحالة
            let statusBadge = '';
            if (r.status === 'pending') {
                statusBadge = `<span class="bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-bold">معلق (بانتظار القبول)</span>`;
            } else if (r.status === 'agreement') {
                statusBadge = `<span class="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded text-[10px] font-bold">مرحلة التفاهم والاتفاق</span>`;
            } else if (r.status === 'in_progress') {
                if (isDelayed) {
                    statusBadge = `<span class="bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded text-[10px] font-black animate-pulse">متأخر عن اللزوم ⚠️</span>`;
                } else {
                    statusBadge = `<span class="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded text-[10px] font-bold">مرحلة العمل على المشروع</span>`;
                }
            } else if (r.status === 'delivered') {
                statusBadge = `<span class="bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded text-[10px] font-black animate-bounce">تم التسليم (بانتظار قبولك)</span>`;
            } else if (r.status === 'completed') {
                statusBadge = `<span class="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded text-[10px] font-bold">مكتمل ومستلم ✅</span>`;
            } else if (r.status === 'disputed') {
                statusBadge = `<span class="bg-red-50 text-red-750 border border-red-100 px-2 py-0.5 rounded text-[10px] font-bold">معترض عليه (نزاع معلق) ⚠️</span>`;
            } else {
                statusBadge = `<span class="bg-red-50 text-red-655 border border-red-100 px-2 py-0.5 rounded text-[10px] font-bold">مرفوض ❌</span>`;
            }

            // أزرار التحكم بالاستلام والدردشة
            let actionsHtml = '';
            if (r.status === 'delivered') {
                actionsHtml = `
                    <div class="flex flex-col items-center gap-1.5 justify-center">
                        <div class="flex gap-1 justify-center">
                            <button onclick="confirmServiceDelivery('${r.id}', '${r.service_title}', ${r.price_usd}, '${r.provider_id}')"
                                class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[9px] py-1 px-2 rounded-lg cursor-pointer transition">
                                ✅ استلام
                            </button>
                            <button onclick="openDisputeModal('${r.id}')"
                                class="bg-red-600 hover:bg-red-700 text-white font-bold text-[9px] py-1 px-2 rounded-lg cursor-pointer transition">
                                ❌ اعتراض
                            </button>
                        </div>
                        <a href="chat.html?request_id=${r.id}" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[9px] py-1 px-2.5 rounded-lg transition inline-block text-center w-full">
                            💬 فتح الشات
                        </a>
                    </div>
                `;
            } else if (r.provider_id) {
                actionsHtml = `
                    <button onclick="openChatFromClient('${r.id}')" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[9px] py-1 px-2.5 rounded-lg transition inline-block cursor-pointer">
                        💬 فتح الشات
                    </button>
                `;
            } else {
                actionsHtml = `<span class="text-gray-400">-</span>`;
            }

            let deliveryInfoHtml = '';
            if (r.status === 'delivered' && r.delivery_file_url) {
                deliveryInfoHtml = `
                    <div class="mt-1.5 bg-slate-50 border border-slate-150 rounded-xl p-2.5 text-right space-y-1 max-w-xs">
                        <p class="text-[9px] text-gray-500 font-bold">📝 ملاحظات الشريك: ${r.delivery_notes || 'لا يوجد'}</p>
                        <a href="${r.delivery_file_url}" target="_blank" class="inline-flex items-center gap-1 text-[9px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg font-black hover:bg-emerald-100 transition">
                            💾 تنزيل المشروع النهائي
                        </a>
                    </div>
                `;
            }

            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-50 transition border-b border-slate-50';
            row.innerHTML = `
                <td class="p-3 font-bold text-gray-800">
                    <div>${r.service_title}</div>
                    ${deliveryInfoHtml}
                </td>
                <td class="p-3 text-center font-bold text-indigo-700">$${parseFloat(r.price_usd || 0).toFixed(2)}</td>
                <td class="p-3 text-center font-semibold ${isDelayed ? 'text-red-600 font-bold' : 'text-gray-500'}">${expectedDelivery}</td>
                <td class="p-3 text-center">${statusBadge}</td>
                <td class="p-3 text-center">${actionsHtml}</td>
            `;
            tableBody.appendChild(row);
        });

    } catch (e) {
        console.error("Error loading service requests for client:", e);
    }
}

// دالة تأكيد استلام العمل (حسم لصالح مقدم الخدمة)
async function confirmServiceDelivery(reqId, serviceTitle, priceUsd, providerId) {
    if (!confirm(`هل أنت متأكد من استلام العمل الخاص بـ (${serviceTitle}) بالكامل؟\nسيتم حسم حالة الطلب لمكتمل نهائياً وصرف المستحقات للشريك.`)) return;

    try {
        // 1. تحديث الطلب كـ مكتمل
        const { error } = await _supabase
            .from('service_requests')
            .update({ status: 'completed' })
            .eq('id', reqId);

        if (error) throw error;

        // 2. صرف الأرباح لمحفظة الشريك مقدم الخدمة
        if (providerId && providerId !== 'null' && providerId !== '') {
            const { data: wallet } = await _supabase
                .from('provider_wallets')
                .select('*')
                .eq('provider_id', providerId)
                .maybeSingle();

            if (wallet) {
                const newCompleted = (wallet.completed_requests || 0) + 1;
                const newRev = parseFloat(wallet.total_revenue_usd || 0) + parseFloat(priceUsd);
                const newBal = parseFloat(wallet.payout_balance_usd || 0) + parseFloat(priceUsd);

                await _supabase
                    .from('provider_wallets')
                    .update({
                        completed_requests: newCompleted,
                        total_revenue_usd: newRev,
                        payout_balance_usd: newBal
                    })
                    .eq('provider_id', providerId);
            }
        }

        showToast("تهانينا! تم تأكيد استلام العمل بنجاح وصرف مستحقات الشريك.", "success");
        loadClientServiceRequests(user);

        // إرسال تنبيه تلجرام للأدمن
        const BOT_TOKEN = "8636070898:AAFA5OZwJ81WqVvC9TfaudmOjLKV4r43tcM";
        const CHAT_ID = "1746721547";
        const alertMsg = `✅ تأكيد استلام عمل مكتمل:\n👤 الزبون: ${user.name}\n📦 الخدمة: ${serviceTitle}\n💰 القيمة المصروفة للشريك: $${priceUsd}`;
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(alertMsg)}`);

        // فتح نافذة التقييم بالنجوم
        document.getElementById('rate-request-id').value = reqId;
        
        const { data: reqDetails } = await _supabase
            .from('service_requests')
            .select('service_id')
            .eq('id', reqId)
            .single();

        document.getElementById('rate-service-id').value = reqDetails?.service_id || '';
        setStarRating(5); // تقييم 5 نجوم تلقائي
        document.getElementById('rate-comment').value = '';
        document.getElementById('rate-service-modal').classList.remove('hidden');

    } catch (e) {
        console.error("Error confirming service delivery:", e);
        showToast("حدث خطأ أثناء تأكيد استلام الخدمة.", "error");
    }
}

// اعتراض وفتح المودال
function openDisputeModal(reqId) {
    document.getElementById('dispute-request-id').value = reqId;
    document.getElementById('dispute-reason').value = '';
    document.getElementById('client-dispute-modal').classList.remove('hidden');
}

function closeDisputeModal() {
    document.getElementById('client-dispute-modal').classList.add('hidden');
}

async function submitDispute(event) {
    event.preventDefault();
    const reqId = document.getElementById('dispute-request-id').value;
    const reason = document.getElementById('dispute-reason').value.trim();

    try {
        // 1. تحديث الطلب كـ نزاع معلق
        const { data: reqData, error: updErr } = await _supabase
            .from('service_requests')
            .update({
                status: 'disputed',
                dispute_reason: reason
            })
            .eq('id', reqId)
            .select()
            .single();

        if (updErr) throw updErr;

        showToast("تم إرسال الاعتراض والنزاع بنجاح. سيقوم الأدمن بالتواصل لحل المشكلة قريباً.", "success");
        closeDisputeModal();
        loadClientServiceRequests(user);

        // 2. جلب أرقام هواتف الأطراف لتركيب أزرار واتساب التفاعلية للأدمن
        let providerName = 'مقدم الخدمة';
        let providerPhone = '213657693583';

        if (reqData.provider_id) {
            const { data: prov } = await _supabase
                .from('clients')
                .select('name, phone')
                .eq('id', reqData.provider_id)
                .single();
            if (prov) {
                providerName = prov.name;
                providerPhone = prov.phone;
            }
        }

        const clientName = user.name || 'الزبون';
        const clientPhone = user.phone || '';

        // 3. إرسال إشعار تليجرام للأدمن بأزرار واتساب الطرفين
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: `💬 واتساب الزبون: ${clientName}`, url: `https://wa.me/${clientPhone.replace(/\s+/g, '')}` },
                    { text: `💬 واتساب الشريك: ${providerName}`, url: `https://wa.me/${providerPhone.replace(/\s+/g, '')}` }
                ]
            ]
        };

        const alertText = `⚠️ نزاع على طلب خدمة!\n\n👤 الزبون: ${clientName}\n🤝 الشريك: ${providerName}\n📦 الخدمة: ${reqData.service_title}\n💬 سبب الاعتراض: ${reason}\n\nيرجى التواصل الفوري لحل النزاع عبر أزرار واتساب أدناه:`;
        
        try {
            await _supabase.rpc('secure_send_telegram', {
                p_message: alertText,
                p_chat_id: '1746721547',
                p_reply_markup: inlineKeyboard
            });
        } catch (_) {}

    } catch (e) {
        console.error("Error submitting dispute:", e);
        showToast("حدث خطأ أثناء تقديم الاعتراض.", "error");
    }
}

function setStarRating(num) {
    document.getElementById('rate-val').value = num;
    const stars = document.querySelectorAll('#stars-container [data-star]');
    stars.forEach(star => {
        const starNum = parseInt(star.getAttribute('data-star'));
        if (starNum <= num) {
            star.classList.remove('text-gray-300');
            star.classList.add('text-amber-400');
        } else {
            star.classList.remove('text-amber-400');
            star.classList.add('text-gray-300');
        }
    });
}

async function submitServiceRating(event) {
    if (event) event.preventDefault();
    const reqId = document.getElementById('rate-request-id').value;
    let serviceId = document.getElementById('rate-service-id').value;
    const rating = parseInt(document.getElementById('rate-val').value);
    const comment = document.getElementById('rate-comment').value.trim();

    if (!reqId || reqId === 'null' || reqId === '') {
        closeRateModal();
        return;
    }

    // التحقق من أن معرف الخدمة بصيغة UUID صالحة وإلا نرسله كـ null
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!serviceId || !uuidRegex.test(serviceId)) {
        serviceId = null;
    }

    try {
        const { error } = await _supabase
            .from('service_reviews')
            .insert([{
                request_id: reqId,
                service_id: serviceId,
                client_name: user.name || 'زبون المنصة',
                rating: rating,
                comment: comment
            }]);

        if (error) throw error;

        showToast("شكراً لك! تم حفظ تقييمك بنجاح ومشاركته مع الزوار.", "success");
        closeRateModal();
        loadClientServiceRequests(user);
    } catch (e) {
        console.error("Error saving review:", e);
        showToast("حدث خطأ أثناء حفظ التقييم.", "error");
    }
}

function closeRateModal() {
    document.getElementById('rate-service-modal').classList.add('hidden');
}

function openChatFromClient(reqId) {
    localStorage.setItem('active_chat_request_id', reqId);
    window.location.href = 'inbox.html';
}

window.loadClientServiceRequests = loadClientServiceRequests;
window.confirmServiceDelivery = confirmServiceDelivery;
window.openDisputeModal = openDisputeModal;
window.closeDisputeModal = closeDisputeModal;
window.submitDispute = submitDispute;
window.setStarRating = setStarRating;
window.submitServiceRating = submitServiceRating;
window.closeRateModal = closeRateModal;
window.openChatFromClient = openChatFromClient;

async function hashPassword(password) {
    if (!password) return '';
    try {
        const msgBuffer = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        console.error("Hashing failed, falling back to base64", e);
        return btoa(unescape(encodeURIComponent(password)));
    }
}

async function checkClientTelegramStatus() {
    const input = document.getElementById('client-tg-chat-id-input');
    if (!input || !user) return;

    try {
        const { data: clientData, error } = await _supabase
            .from('clients')
            .select('telegram_chat_id')
            .eq('id', user.id)
            .maybeSingle();

        if (error) throw error;

        if (clientData && clientData.telegram_chat_id) {
            input.value = clientData.telegram_chat_id;
            user.telegram_chat_id = clientData.telegram_chat_id;
            localStorage.setItem('currentUser', JSON.stringify(user));
        }
    } catch (e) {
        console.error("Error checking client telegram status:", e);
    }
}

async function saveClientTelegramChatId() {
    const input = document.getElementById('client-tg-chat-id-input');
    if (!input) return;
    const chatId = input.value.trim();

    if (!chatId) {
        showToast("يرجى إدخال معرف تليجرام صحيح.", "error");
        return;
    }

    try {
        const { error } = await _supabase
            .from('clients')
            .update({ telegram_chat_id: chatId })
            .eq('id', user.id);

        if (error) throw error;

        user.telegram_chat_id = chatId;
        localStorage.setItem('currentUser', JSON.stringify(user));

        // إرسال تنبيه تجريبي عبر البوت للزبون
        const BOT_TOKEN = "8636070898:AAFA5OZwJ81WqVvC9TfaudmOjLKV4r43tcM";
        const testUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent("🎉 تم ربط حسابك بنجاح في AdVault! ستصلك تنبيهات بخصوص ميزانية حملاتك الإعلانية وحالة طلبات الخدمات الخاصة بك.")}`;
        try {
            await fetch(testUrl);
        } catch (_) {}

        showToast("تم حفظ معرف التليجرام وإرسال رسالة تأكيد بنجاح! 🏆", "success");
    } catch (e) {
        console.error("Error saving client telegram chat ID:", e);
        showToast("حدث خطأ أثناء حفظ معرف التليجرام.", "error");
    }
}

async function changeClientPassword(event) {
    if (event) event.preventDefault();
    const newPassInput = document.getElementById('client-new-pass');
    const newPass = newPassInput.value.trim();

    if (!newPass || newPass.length < 4) {
        showToast("يرجى كتابة كلمة مرور قوية مكونة من 4 أحرف أو أكثر.", "error");
        return;
    }

    try {
        const hashed = await hashPassword(newPass);

        const { error } = await _supabase
            .from('clients')
            .update({ password: hashed })
            .eq('id', user.id);

        if (error) throw error;

        // تحديث محلي للجلسة
        user.password = hashed;
        localStorage.setItem('currentUser', JSON.stringify(user));

        showToast("تم تحديث كلمة المرور بنجاح! 🔒", "success");
        newPassInput.value = '';

    } catch (e) {
        console.error("Error changing client password:", e);
        showToast("حدث خطأ أثناء تحديث كلمة المرور.", "error");
    }
}

// ==========================================
//  توليد فواتير PDF للمدفوعات تلقائياً (jsPDF)
// ==========================================
window.downloadPDFReceipt = function(pId, date, amountUsd, amountDzd, note) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a5"
        });

        // تصميم احترافي بلون بنفسجي داكن
        doc.setFillColor(109, 40, 217);
        doc.rect(0, 0, 148, 25, "F");

        // عنوان الهيدر
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text("AdVault Receipt", 10, 16);

        // تفاصيل الفاتورة
        doc.setTextColor(50, 50, 50);
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        
        doc.text(`Receipt ID: #${pId.substring(0, 8).toUpperCase()}`, 10, 38);
        doc.text(`Date: ${date}`, 10, 44);
        doc.text(`Client Name: ${user.name || 'Client'}`, 10, 50);
        doc.text(`Client Phone: ${user.phone || '-'}`, 10, 56);

        // خط فاصل
        doc.setDrawColor(220, 220, 220);
        doc.line(10, 62, 138, 62);

        // تفاصيل الحركة المالية
        doc.setFont("helvetica", "bold");
        doc.text("Description", 10, 70);
        doc.text("Amount", 110, 70);

        doc.setFont("helvetica", "normal");
        doc.text("Recharge Ads Balance", 10, 78);
        doc.text(`$${parseFloat(amountUsd).toFixed(2)}`, 110, 78);

        doc.text("Exchange Rate (CCP/Baridimob)", 10, 84);
        const rate = Math.round(amountDzd / amountUsd) || 240;
        doc.text(`${rate} DZD`, 110, 84);

        // خط فاصل آخر
        doc.line(10, 90, 138, 90);

        // الإجمالي بالدينار والرموز
        doc.setFont("helvetica", "bold");
        doc.text("Total Paid (DZD):", 10, 98);
        doc.setTextColor(16, 185, 129); // أخضر زمردي
        doc.text(`${parseFloat(amountDzd).toLocaleString('fr-FR')} DZD`, 110, 98);

        doc.setTextColor(120, 120, 120);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.text("Thank you for choosing AdVault!", 10, 115);
        doc.text("This receipt is generated automatically by AdVault.", 10, 120);

        // حفظ الملف وتنزيله
        doc.save(`Receipt_${pId.substring(0, 8).toUpperCase()}.pdf`);
        showToast("تم تحميل فاتورة PDF بنجاح! 📄", "success");
    } catch (err) {
        console.error("PDF generation failed:", err);
        showToast("فشل توليد الفاتورة بالمتصفح.", "error");
    }
};

// ==========================================
//  نظام تذاكر الدعم الفني للعميل (Support Tickets)
// ==========================================
async function loadClientTickets() {
    const tableBody = document.getElementById('client-tickets-table-body');
    if (!tableBody) return;

    try {
        const { data, error } = await _supabase
            .from('support_tickets')
            .select('*')
            .eq('client_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const tickets = data || [];
        if (tickets.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="p-6 text-center text-gray-400 font-bold">لا توجد تذاكر دعم فني مفتوحة حالياً.</td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = '';
        tickets.forEach(t => {
            const date = new Date(t.updated_at).toLocaleDateString('ar-DZ', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            let statusBadge = '';
            if (t.status === 'open') {
                statusBadge = '<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-bold">مفتوحة</span>';
            } else if (t.status === 'in_progress') {
                statusBadge = '<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-bold">قيد المعالجة</span>';
            } else if (t.status === 'resolved') {
                statusBadge = '<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">تم الحل ✅</span>';
            }

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';
            
            const escapedDesc = (t.description || '').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
            const escapedReply = (t.admin_reply || '').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
            const escapedTitle = (t.title || '').replace(/'/g, "\\'").replace(/"/g, '\\"');

            tr.innerHTML = `
                <td class="p-3 font-bold text-gray-800">${t.title}</td>
                <td class="p-3 text-gray-500 font-semibold">${t.category}</td>
                <td class="p-3 text-center">${statusBadge}</td>
                <td class="p-3 text-center text-gray-400 whitespace-nowrap">${date}</td>
                <td class="p-3 text-left">
                    <button onclick="openViewTicketModal('${escapedTitle}', '${t.category}', '${escapedDesc}', '${escapedReply || 'لم يتم الرد من طرف الإدارة بعد.'}')"
                        class="bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold py-1 px-2.5 rounded-lg text-[10px] transition cursor-pointer">
                        🔍 عرض
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

    } catch (e) {
        console.error("Error loading tickets:", e);
    }
}

function openNewTicketModal() {
    document.getElementById('new-ticket-modal').classList.remove('hidden');
}

function closeNewTicketModal() {
    document.getElementById('new-ticket-modal').classList.add('hidden');
    document.getElementById('ticket-title').value = '';
    document.getElementById('ticket-description').value = '';
}

async function submitSupportTicket(event) {
    if (event) event.preventDefault();
    const title = document.getElementById('ticket-title').value.trim();
    const category = document.getElementById('ticket-category').value;
    const description = document.getElementById('ticket-description').value.trim();
    const submitBtn = document.getElementById('ticket-submit-btn');

    if (!title || !description) {
        showToast("يرجى ملء جميع الحقول المطلوبة.", "error");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "⏳ جاري الإرسال...";

    try {
        const { error } = await _supabase
            .from('support_tickets')
            .insert([{
                client_id: user.id,
                title: title,
                category: category,
                description: description
            }]);

        if (error) throw error;

        // إرسال إشعار فوري للأدمن
        const alertText = `🛠️ تذكرة دعم فني جديدة!
👤 الزبون: ${user.name || 'زبون المنصة'}
📌 العنوان: ${title}
📂 التصنيف: ${category}
يرجى الدخول للوحة التحكم والمتابعة.`;
        await sendTelegramNotification(alertText);

        showToast("تم فتح تذكرة الدعم بنجاح وسيتواصل المسؤولون معك قريباً! 🛠️", "success");
        closeNewTicketModal();
        await loadClientTickets();

    } catch (e) {
        console.error("Error submitting support ticket:", e);
        showToast("حدث خطأ أثناء إرسال تذكرة الدعم.", "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "💾 إرسال التذكرة";
    }
}

function openViewTicketModal(title, category, desc, reply) {
    document.getElementById('view-ticket-category').innerText = category;
    document.getElementById('view-ticket-title').innerText = title;
    document.getElementById('view-ticket-desc').innerText = desc;
    document.getElementById('view-ticket-reply').innerText = reply;
    document.getElementById('view-ticket-modal').classList.remove('hidden');
}

function closeViewTicketModal() {
    document.getElementById('view-ticket-modal').classList.add('hidden');
}

window.checkClientTelegramStatus = checkClientTelegramStatus;
window.saveClientTelegramChatId = saveClientTelegramChatId;
window.changeClientPassword = changeClientPassword;
window.loadClientTickets = loadClientTickets;
window.openNewTicketModal = openNewTicketModal;
window.closeNewTicketModal = closeNewTicketModal;
window.submitSupportTicket = submitSupportTicket;
window.openViewTicketModal = openViewTicketModal;
window.closeViewTicketModal = closeViewTicketModal;