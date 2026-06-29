// ==========================================
//  إعدادات Supabase والتحقق من الجلسة
// ==========================================
const SUPABASE_URL = "https://uljdazwcjxogpymvbflq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DGoBEde67ewtWtMlC4Nx9w_cuvSAmUc";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const adminUser = JSON.parse(localStorage.getItem('currentUser'));
if (!adminUser || adminUser.role !== 'admin') {
    window.location.href = 'index.html';
}

// مصفوفة حفظ الخدمات
let allServices = [];

document.addEventListener('DOMContentLoaded', () => {
    loadServices();
});

// ==========================================
//  جلب الخدمات من قاعدة البيانات
// ==========================================
async function loadServices() {
    const tableBody = document.getElementById('services-table-body');
    const badge = document.getElementById('services-count-badge');
    
    tableBody.innerHTML = `
        <tr>
            <td colspan="6" class="p-8 text-center text-gray-400 font-bold">جاري تحميل الخدمات...</td>
        </tr>
    `;

    try {
        const { data, error } = await _supabase
            .from('services')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        allServices = data || [];
        badge.innerText = `${allServices.length} خدمات`;

        if (allServices.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="p-8 text-center text-gray-400 font-bold">✨ لا توجد أي خدمات معروضة حالياً. اضغط على "+ إضافة خدمة جديدة" للبدء.</td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = '';
        allServices.forEach(srv => {
            const isFree = parseFloat(srv.price_usd || 0) === 0;
            const priceText = isFree ? 'مجاني ✅' : `$${parseFloat(srv.price_usd).toFixed(2)}`;
            const priceClass = isFree ? 'text-emerald-600 font-black' : 'text-purple-700 font-extrabold';

            // عرض الشعار
            let logoHtml = '';
            const isEmoji = !srv.logo_url || srv.logo_url.length <= 4;
            if (isEmoji) {
                logoHtml = `<span class="text-3xl select-none">${srv.logo_url || '📦'}</span>`;
            } else {
                logoHtml = `<img src="${srv.logo_url}" alt="${srv.title}" class="w-10 h-10 object-contain rounded-lg border border-gray-150">`;
            }

            // شارة الحالة
            let statusBadge = '';
            const statusVal = srv.status || 'متوفر';
            if (statusVal === 'متوفر') {
                statusBadge = `<span class="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded-lg">متوفر</span>`;
            } else if (statusVal === 'غير متوفر') {
                statusBadge = `<span class="bg-red-50 text-red-750 border border-red-100 text-[10px] font-bold px-2 py-0.5 rounded-lg">غير متوفر</span>`;
            } else if (statusVal === 'قريباً') {
                statusBadge = `<span class="bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-bold px-2 py-0.5 rounded-lg">قريباً</span>`;
            } else {
                statusBadge = `<span class="bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-bold px-2 py-0.5 rounded-lg">انتهت الاشتراكات</span>`;
            }

            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-50/50 transition';
            row.innerHTML = `
                <td class="p-4 text-center">
                    <div class="inline-flex items-center justify-center p-1.5 bg-slate-100/50 rounded-xl">
                        ${logoHtml}
                    </div>
                </td>
                <td class="p-4 font-bold text-gray-800">${srv.title}</td>
                <td class="p-4 text-xs text-gray-400 max-w-xs truncate">${srv.description}</td>
                <td class="p-4"><span class="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">${srv.category}</span></td>
                <td class="p-4 text-center">${statusBadge}</td>
                <td class="p-4 text-center font-mono ${priceClass}">${priceText}</td>
                <td class="p-4 flex justify-center gap-2 flex-wrap">
                    <button onclick="openEditModal('${srv.id}')"
                        class="bg-indigo-50 hover:bg-indigo-150 text-indigo-700 text-xs font-bold py-2 px-3.5 rounded-xl cursor-pointer transition">
                        ✏️ تعديل
                    </button>
                    <button onclick="deleteService('${srv.id}', '${srv.title}')"
                        class="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold py-2 px-3 rounded-xl cursor-pointer transition">
                        🗑️ حذف
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });

    } catch (err) {
        console.error("Error loading services:", err);
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="p-8 text-center text-red-500 font-bold">حدث خطأ أثناء تحميل الخدمات من قاعدة البيانات.</td>
            </tr>
        `;
    }
}

// ==========================================
//  إدارة النوافذ المنبثقة (Modals)
// ==========================================
function openAddModal() {
    document.getElementById('service-id').value = '';
    document.getElementById('service-form').reset();
    document.getElementById('modal-title').innerText = "إضافة خدمة جديدة";
    document.getElementById('service-modal').classList.remove('hidden');
}

function openEditModal(serviceId) {
    const srv = allServices.find(s => s.id === serviceId);
    if (!srv) return;

    document.getElementById('service-id').value = srv.id;
    document.getElementById('service-title').value = srv.title;
    document.getElementById('service-description').value = srv.description;
    document.getElementById('service-category').value = srv.category;
    document.getElementById('service-price').value = srv.price_usd;
    document.getElementById('service-status').value = srv.status || 'متوفر';
    document.getElementById('service-logo').value = srv.logo_url || '';
    document.getElementById('service-whatsapp').value = srv.whatsapp_custom_text || '';

    document.getElementById('modal-title').innerText = "تعديل الخدمة المعروضة";
    document.getElementById('service-modal').classList.remove('hidden');
}

function closeServiceModal() {
    document.getElementById('service-modal').classList.add('hidden');
}

function selectEmoji(emoji) {
    document.getElementById('service-logo').value = emoji;
}

window.openAddModal = openAddModal;
window.openEditModal = openEditModal;
window.closeServiceModal = closeServiceModal;
window.selectEmoji = selectEmoji;

// ==========================================
//  حفظ وإضافة/تحديث البيانات
// ==========================================
async function handleFormSubmit(event) {
    event.preventDefault();
    const id = document.getElementById('service-id').value;
    const title = document.getElementById('service-title').value.trim();
    const description = document.getElementById('service-description').value.trim();
    const category = document.getElementById('service-category').value.trim();
    const price = parseFloat(document.getElementById('service-price').value || 0);
    const status = document.getElementById('service-status').value;
    const logoUrl = document.getElementById('service-logo').value.trim();
    const whatsappText = document.getElementById('service-whatsapp').value.trim();

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = "⏳ جاري الحفظ والتثبيت...";

    try {
        const payload = {
            title,
            description,
            category,
            price_usd: price,
            status,
            logo_url: logoUrl,
            whatsapp_custom_text: whatsappText
        };

        let result;
        if (id) {
            // Edit Mode
            result = await _supabase
                .from('services')
                .update(payload)
                .eq('id', id);
        } else {
            // Add Mode
            result = await _supabase
                .from('services')
                .insert([payload]);
        }

        if (result.error) throw result.error;

        showToast(`تم حفظ وتثبيت خدمة (${title}) بنجاح!`, "success");
        closeServiceModal();
        loadServices();

    } catch (err) {
        console.error("Error saving service:", err);
        showToast("حدث خطأ أثناء محاولة حفظ الخدمة في السيرفر", "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = "حفظ الخدمة والتثبيت";
    }
}

window.handleFormSubmit = handleFormSubmit;

// ==========================================
//  حذف الخدمة
// ==========================================
async function deleteService(serviceId, title) {
    const confirmDelete = confirm(`هل أنت متأكد من حذف خدمة (${title}) نهائياً من العرض للزبائن؟`);
    if (!confirmDelete) return;

    try {
        const { error } = await _supabase
            .from('services')
            .delete()
            .eq('id', serviceId);

        if (error) throw error;

        showToast(`تم حذف الخدمة (${title}) بنجاح.`, "success");
        loadServices();

    } catch (err) {
        console.error("Error deleting service:", err);
        showToast("حدث خطأ أثناء محاولة حذف الخدمة", "error");
    }
}

window.deleteService = deleteService;

// ==========================================
//  دالة إظهار التنبيهات المخصصة الجميلة
// ==========================================
function showToast(message, type = 'success') {
    // تشغيل صوت تفاعلي خفيف للتأكيد
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
