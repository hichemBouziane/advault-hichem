// ==========================================
//  إعدادات Supabase والتحقق من الجلسة
// ==========================================
const SUPABASE_URL = "https://uljdazwcjxogpymvbflq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DGoBEde67ewtWtMlC4Nx9w_cuvSAmUc";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const user = JSON.parse(localStorage.getItem('currentUser'));
if (!user || user.role !== 'client') {
    window.location.href = 'index.html';
}

// متغيرات عامة لحفظ الحالة
let allServices = [];
let selectedCategory = 'الكل';
let clientBalanceUsd = 0;
let clientInfo = {};

document.addEventListener('DOMContentLoaded', async () => {
    await fetchClientInfoAndBalance();
    loadServices();
});

// ==========================================
//  جلب معلومات الزبون وحساب رصيده
// ==========================================
async function fetchClientInfoAndBalance() {
    try {
        // 1. جلب معلومات الزبون الأحدث
        const { data: client } = await _supabase
            .from('clients')
            .select('*')
            .eq('id', user.id)
            .single();
        clientInfo = client || user;

        // 2. جلب الحملات النشطة
        const { data: campaigns } = await _supabase
            .from('facebook_campaigns')
            .select('campaign_name, facebook_spend_euro');

        let totalSpendEuro = 0;
        if (campaigns && clientInfo.campaign_keyword) {
            campaigns.forEach(camp => {
                if (camp.campaign_name.toLowerCase().includes(clientInfo.campaign_keyword.toLowerCase())) {
                    totalSpendEuro += parseFloat(camp.facebook_spend_euro || 0);
                }
            });
        }
        const totalSpendWithProfit = totalSpendEuro * 1.2;

        // 3. جلب المدفوعات
        const { data: payments } = await _supabase
            .from('payments')
            .select('amount_euro')
            .eq('client_id', user.id);

        let totalPaidEuro = payments?.reduce((sum, item) => sum + parseFloat(item.amount_euro || 0), 0) || 0;

        // الرصيد المتوفر بالدولار
        const remainingEuro = totalSpendWithProfit - totalPaidEuro;
        clientBalanceUsd = remainingEuro < 0 ? -remainingEuro : 0;
    } catch (e) {
        console.error("Error computing client balance:", e);
        clientBalanceUsd = 0;
    }
}

// ==========================================
//  جلب الخدمات من قاعدة البيانات
// ==========================================
async function loadServices() {
    const grid = document.getElementById('services-grid');
    grid.innerHTML = `
        <div class="col-span-full py-12 text-center text-gray-400 font-bold">
            ⏳ جاري تحميل الخدمات المتاحة...
        </div>
    `;

    try {
        const { data, error } = await _supabase
            .from('services')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        allServices = data || [];
        renderCategories();
        renderServices();

    } catch (err) {
        console.error("Failed to load services:", err);
        grid.innerHTML = `
            <div class="col-span-full py-12 text-center text-red-500 font-bold">
                ❌ فشل تحميل الخدمات. يرجى مراجعة الاتصال بالخادم.
            </div>
        `;
    }
}

// ==========================================
//  استخراج الفئات وعرض أزرار التصفية
// ==========================================
function renderCategories() {
    const container = document.getElementById('categories-container');
    // إبقاء زر "الكل" افتراضياً
    container.innerHTML = `
        <button onclick="filterCategory('الكل')" id="cat-all"
            class="px-5 py-3 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
                selectedCategory === 'الكل'
                    ? 'border-purple-600 text-purple-600 font-black'
                    : 'border-transparent text-gray-500 hover:text-purple-600'
            }">
            🌍 الكل
        </button>
    `;

    // استخراج الفئات الفريدة
    const categories = [...new Set(allServices.map(s => s.category))].filter(Boolean);

    categories.forEach(cat => {
        const button = document.createElement('button');
        const isActive = selectedCategory === cat;
        button.onclick = () => filterCategory(cat);
        button.className = `px-5 py-3 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
            isActive
                ? 'border-purple-600 text-purple-600 font-black'
                : 'border-transparent text-gray-500 hover:text-purple-600'
        }`;
        button.innerText = cat;
        container.appendChild(button);
    });
}

// ==========================================
//  تصفية الخدمات حسب الفئة
// ==========================================
function filterCategory(category) {
    selectedCategory = category;
    renderCategories();
    renderServices();
}

window.filterCategory = filterCategory;

// ==========================================
//  عرض الخدمات في الصفحة
// ==========================================
function renderServices() {
    const grid = document.getElementById('services-grid');
    grid.innerHTML = '';

    // تصفية المصفوفة
    const filtered = selectedCategory === 'الكل'
        ? allServices
        : allServices.filter(s => s.category === selectedCategory);

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-12 text-center text-gray-400 font-bold">
                🍃 لا توجد أي خدمات متاحة في هذا القسم حالياً.
            </div>
        `;
        return;
    }

    filtered.forEach(srv => {
        const isFree = parseFloat(srv.price_usd || 0) === 0;
        const status = srv.status || 'متوفر';
        
        // شارة السعر
        let priceTag = '';
        if (isFree) {
            priceTag = `<span class="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-black px-2.5 py-1 rounded-lg">مجاناً ✅</span>`;
        } else {
            priceTag = `<span class="bg-purple-50 text-purple-700 border border-purple-100 text-xs font-extrabold px-2.5 py-1 rounded-lg">$${parseFloat(srv.price_usd).toFixed(2)}</span>`;
        }

        // شارة رصيد غير كافي (فقط إذا كانت متوفرة وليست مجانية ورصيد الزبون أقل من السعر)
        let balanceWarning = '';
        const hasInsufficientBalance = !isFree && clientBalanceUsd < parseFloat(srv.price_usd);
        if (status === 'متوفر' && hasInsufficientBalance) {
            balanceWarning = `<span class="bg-red-50 text-red-700 border border-red-100 text-[9px] font-black px-2 py-0.5 rounded-lg select-none">الرصيد غير كافي ⚠️</span>`;
        }

        // شارات الحالات الأخرى
        let statusBadge = '';
        if (status === 'غير متوفر') {
            statusBadge = `<span class="bg-red-50 text-red-755 border border-red-100 text-[9px] font-bold px-2 py-0.5 rounded-lg">غير متوفر</span>`;
        } else if (status === 'قريباً') {
            statusBadge = `<span class="bg-blue-50 text-blue-700 border border-blue-100 text-[9px] font-bold px-2 py-0.5 rounded-lg">قريباً</span>`;
        } else if (status === 'انتهت الاشتراكات') {
            statusBadge = `<span class="bg-amber-50 text-amber-700 border border-amber-100 text-[9px] font-bold px-2 py-0.5 rounded-lg">انتهت الاشتراكات</span>`;
        }

        // الشعار
        let logoHtml = '';
        const isEmoji = !srv.logo_url || srv.logo_url.length <= 4;
        if (isEmoji) {
            logoHtml = `<span class="text-4xl select-none">${srv.logo_url || '📦'}</span>`;
        } else {
            logoHtml = `<img src="${srv.logo_url}" alt="${srv.title}" class="w-12 h-12 object-contain rounded-xl shadow-sm">`;
        }

        // زر الطلب
        let btnLabel = 'طلب الخدمة 🛒';
        let btnClass = 'w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5';
        let btnDisabled = '';

        if (status !== 'متوفر') {
            btnLabel = status;
            btnClass = 'w-full bg-gray-200 text-gray-400 font-bold py-2.5 rounded-xl text-xs cursor-not-allowed flex items-center justify-center select-none';
            btnDisabled = 'disabled';
        }

        const card = document.createElement('div');
        card.className = "bg-white rounded-3xl p-5 border border-gray-150 shadow-sm hover:shadow-md transition duration-300 flex flex-col justify-between space-y-4";
        card.innerHTML = `
            <div class="space-y-3">
                <div class="flex justify-between items-start">
                    <div class="p-2.5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center">
                        ${logoHtml}
                    </div>
                    <div class="flex flex-col items-end gap-1">
                        ${priceTag}
                        ${statusBadge}
                        ${balanceWarning}
                    </div>
                </div>
                <div>
                    <span class="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold">${srv.category}</span>
                    <h3 class="text-sm font-bold text-gray-800 mt-1.5">${srv.title}</h3>
                    <p class="text-[11px] text-gray-400 font-semibold mt-1 leading-normal">${srv.description}</p>
                </div>
            </div>
            
            <button id="order-btn-${srv.id}" onclick="requestService('${srv.id}')" ${btnDisabled}
                class="${btnClass}">
                ${btnLabel}
            </button>
        `;
        grid.appendChild(card);
    });
}

// ==========================================
//  تقديم الطلب والتوجيه للواتساب
// ==========================================
async function requestService(serviceId) {
    const srv = allServices.find(s => s.id === serviceId);
    if (!srv || srv.status !== 'متوفر') return;

    const isFree = parseFloat(srv.price_usd || 0) === 0;
    
    // 1. تحقق من كفاية الرصيد
    if (!isFree && clientBalanceUsd < parseFloat(srv.price_usd)) {
        showToast(`عذراً، رصيدك الحالي ($${clientBalanceUsd.toFixed(2)}) غير كافي لطلب هذه الخدمة ($${parseFloat(srv.price_usd).toFixed(2)}).`, "error");
        return;
    }

    const btn = document.getElementById(`order-btn-${serviceId}`);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = "⏳ جاري إرسال الطلب...";
    }

    try {
        // 2. إرسال الطلب المعلق إلى جدول service_requests
        const { error: insertErr } = await _supabase
            .from('service_requests')
            .insert([{
                client_id: user.id,
                client_name: user.name || 'زبون تجاري',
                service_id: srv.id,
                service_title: srv.title,
                price_usd: srv.price_usd,
                status: 'pending'
            }]);

        if (insertErr) throw insertErr;

        // 3. إرسال تنبيه تليجرام للأدمن فورا
        const priceText = isFree ? 'مجاناً' : `$${parseFloat(srv.price_usd).toFixed(2)}`;
        const telegramMessage = `🛍️ طلب شراء خدمة جديد معلق:
👤 الزبون: ${user.name || 'زبون تجاري'}
📦 الخدمة: ${srv.title}
💵 السعر: ${priceText}
يرجى المراجعة والقبول من لوحة التحكم.`;
        await sendTelegramNotification(telegramMessage);

        showToast("تم تقديم طلبك بنجاح! جاري تحويلك لواتساب الشركة...", "success");

        // 4. تحويل لواتساب بعد قليل
        const companyNumber = "213657693583";
        const customText = srv.whatsapp_custom_text || `مرحباً، أود الاستفسار عن خدمة (${srv.title}) المعروضة في بوابة الخدمات.`;
        const encodedText = encodeURIComponent(customText);
        const whatsappUrl = `https://wa.me/${companyNumber}?text=${encodedText}`;

        setTimeout(() => {
            window.open(whatsappUrl, '_blank');
            location.reload();
        }, 1500);

    } catch (err) {
        console.error("Error submitting service request:", err);
        showToast("فشل تقديم الطلب. يرجى مراجعة الخادم.", "error");
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = "طلب الخدمة 🛒";
        }
    }
}

window.requestService = requestService;

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
//  دالة إظهار التنبيهات المخصصة الجميلة
// ==========================================
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast-notification');
    const toastTitle = document.getElementById('toast-title');
    const toastBody = document.getElementById('toast-msg-body');
    const toastIcon = document.getElementById('toast-icon');

    if (type === 'success') {
        toastTitle.innerText = "تمت العملية بنجاح";
        toastIcon.innerText = "✅";
        toast.classList.replace('border-red-500', 'border-emerald-500');
    } else {
        toastTitle.innerText = "تنبيه";
        toastIcon.innerText = "❌";
        toast.classList.replace('border-emerald-500', 'border-red-500');
    }

    toastBody.innerText = message;
    toast.classList.remove('hidden');
    
    // Slide In
    setTimeout(() => {
        toast.classList.remove('translate-x-80', 'opacity-0');
    }, 50);

    // Slide Out & Hide
    setTimeout(() => {
        toast.classList.add('translate-x-80', 'opacity-0');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 300);
    }, 4500);
}
