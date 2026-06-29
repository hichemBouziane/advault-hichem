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

document.addEventListener('DOMContentLoaded', () => {
    loadServices();
});

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
        const priceTag = isFree
            ? `<span class="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-black px-2.5 py-1 rounded-lg">مجاناً ✅</span>`
            : `<span class="bg-purple-50 text-purple-700 border border-purple-100 text-xs font-extrabold px-2.5 py-1 rounded-lg">$${parseFloat(srv.price_usd).toFixed(2)}</span>`;

        // التحقق من الأيقونة/الشعار
        let logoHtml = '';
        const isEmoji = !srv.logo_url || srv.logo_url.length <= 4; // كود تعبيري
        if (isEmoji) {
            logoHtml = `<span class="text-4xl select-none">${srv.logo_url || '📦'}</span>`;
        } else {
            logoHtml = `<img src="${srv.logo_url}" alt="${srv.title}" class="w-12 h-12 object-contain rounded-xl shadow-sm">`;
        }

        const card = document.createElement('div');
        card.className = "bg-white rounded-3xl p-5 border border-gray-150 shadow-sm hover:shadow-md transition duration-300 flex flex-col justify-between space-y-4";
        card.innerHTML = `
            <div class="space-y-3">
                <div class="flex justify-between items-start">
                    <div class="p-2.5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center">
                        ${logoHtml}
                    </div>
                    ${priceTag}
                </div>
                <div>
                    <span class="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold">${srv.category}</span>
                    <h3 class="text-sm font-bold text-gray-800 mt-1.5">${srv.title}</h3>
                    <p class="text-[11px] text-gray-400 font-semibold mt-1 leading-normal">${srv.description}</p>
                </div>
            </div>
            
            <button onclick="requestService('${srv.id}')"
                class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5">
                طلب الخدمة 🛒
            </button>
        `;
        grid.appendChild(card);
    });
}

// ==========================================
//  إرسال طلب الخدمة للواتساب
// ==========================================
function requestService(serviceId) {
    const srv = allServices.find(s => s.id === serviceId);
    if (!srv) return;

    const companyNumber = "213657693583";
    const customText = srv.whatsapp_custom_text || `مرحباً، أود الاستفسار عن خدمة (${srv.title}) المعروضة في بوابة الخدمات.`;
    const encodedText = encodeURIComponent(customText);
    const whatsappUrl = `https://wa.me/${companyNumber}?text=${encodedText}`;

    showToast(`جاري تحويلك لواتساب الشركة لطلب خدمة: ${srv.title}...`, "success");

    setTimeout(() => {
        window.open(whatsappUrl, '_blank');
    }, 1200);
}

window.requestService = requestService;

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
    }, 4000);
}
