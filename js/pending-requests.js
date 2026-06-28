// ==========================================
//  إعدادات Supabase
// ==========================================
const SUPABASE_URL = "https://uljdazwcjxogpymvbflq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DGoBEde67ewtWtMlC4Nx9w_cuvSAmUc";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================================
//  تهيئة الصفحة
// ==========================================
let adminUser;

document.addEventListener('DOMContentLoaded', () => {
    adminUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!adminUser || adminUser.role !== 'admin') {
        window.location.href = 'index.html';
        return;
    }
    loadPendingRequests();
});

// ==========================================
//  جلب وعرض الطلبات المعلقة
// ==========================================
async function loadPendingRequests() {
    const tableBody = document.getElementById('pending-requests-table');
    const badge = document.getElementById('requests-count-badge');
    
    tableBody.innerHTML = `
        <tr>
            <td colspan="5" class="p-8 text-center text-gray-400 font-bold">جاري تحميل الطلبات...</td>
        </tr>
    `;

    try {
        const { data: requests, error } = await _supabase
            .from('clients')
            .select('*')
            .eq('role', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // تحديث العداد
        badge.innerText = `${requests.length} طلبات`;

        if (requests.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="p-8 text-center text-gray-400 font-bold">🎉 لا توجد أي طلبات تسجيل معلقة حالياً.</td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = '';
        requests.forEach(req => {
            const date = new Date(req.created_at);
            const formattedDate = date.toLocaleDateString('ar-DZ', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            // رقم الواتساب ورابط المحادثة
            const whatsappNumber = req.phone;
            const welcomeText = `مرحباً ${req.name}، معك مسؤول منصة AdVault لإدارة الإعلانات. لقد تلقينا طلب تسجيلك للعمل في مجال (${req.campaign_keyword}). يسعدني التواصل معك لتفعيل حسابك وتأكيد التفاصيل.`;
            const encodedWelcome = encodeURIComponent(welcomeText);
            const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedWelcome}`;

            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-50/50 transition';
            row.innerHTML = `
                <td class="p-4 font-bold text-gray-800">${req.name}</td>
                <td class="p-4 font-mono text-gray-600">${whatsappNumber}</td>
                <td class="p-4 font-semibold"><span class="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg text-xs">${req.campaign_keyword}</span></td>
                <td class="p-4 text-xs text-gray-400 font-semibold">${formattedDate}</td>
                <td class="p-4 flex justify-center gap-2 flex-wrap">
                    <!-- زر واتساب -->
                    <a href="${whatsappUrl}" target="_blank" class="bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-bold py-2 px-3.5 rounded-xl flex items-center gap-1.5 shadow-md shadow-green-600/10 cursor-pointer transition">
                        💬 تحدث واتساب
                    </a>
                    <!-- زر تفعيل -->
                    <button onclick="openActivationModal('${req.id}', '${req.name}', '${req.phone}', '${req.campaign_keyword}')" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-3.5 rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer transition">
                        🔑 تفعيل الحساب
                    </button>
                    <!-- زر رفض وحذف -->
                    <button onclick="deleteRequest('${req.id}', '${req.name}')" class="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold py-2 px-3 rounded-xl flex items-center cursor-pointer transition">
                        🗑️ رفض الطلب
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });

    } catch (err) {
        console.error("Error loading pending requests:", err);
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="p-8 text-center text-red-500 font-bold">حدث خطأ أثناء تحميل البيانات من الخادم.</td>
            </tr>
        `;
    }
}

// ==========================================
//  تفعيل وحذف الطلبات
// ==========================================
function openActivationModal(id, name, phone, niche) {
    document.getElementById('activate-id').value = id;
    document.getElementById('activate-name').value = name;
    document.getElementById('activate-phone').value = phone;
    document.getElementById('activate-keyword').value = niche; // الاقتراح الأولي
    document.getElementById('activate-password').value = phone; // كلمة مرور افتراضية تسهيلاً للتسجيل
    document.getElementById('activate-rate').value = 230; // القيمة الافتراضية
    
    document.getElementById('activation-modal').classList.remove('hidden');
}

function closeActivationModal() {
    document.getElementById('activation-modal').classList.add('hidden');
}

async function submitActivation() {
    const id = document.getElementById('activate-id').value;
    const name = document.getElementById('activate-name').value;
    const keyword = document.getElementById('activate-keyword').value.trim();
    const rate = document.getElementById('activate-rate').value.trim();
    const password = document.getElementById('activate-password').value.trim();

    if (!keyword || !rate || !password) {
        showToast("يرجى ملء جميع الحقول المطلوبة للتفعيل", "error");
        return;
    }

    try {
        const { error } = await _supabase
            .from('clients')
            .update({
                role: 'client',
                campaign_keyword: keyword,
                exchange_rate: parseInt(rate),
                password: password
            })
            .eq('id', id);

        if (error) throw error;

        showToast(`تم تفعيل حساب الزبون (${name}) بنجاح!`, "success");
        closeActivationModal();
        loadPendingRequests();

    } catch (err) {
        console.error("Error activating client:", err);
        showToast("حدث خطأ أثناء تفعيل الحساب في قاعدة البيانات", "error");
    }
}

async function deleteRequest(id, name) {
    const confirmDelete = confirm(`هل أنت متأكد من رفض وحذف طلب الزبون (${name}) نهائياً من قائمة الانتظار؟`);
    if (!confirmDelete) return;

    try {
        const { error } = await _supabase
            .from('clients')
            .delete()
            .eq('id', id);

        if (error) throw error;

        showToast(`تم حذف ورفض طلب (${name}) بنجاح.`, "success");
        loadPendingRequests();

    } catch (err) {
        console.error("Error deleting request:", err);
        showToast("حدث خطأ أثناء محاولة حذف الطلب", "error");
    }
}

// ==========================================
//  تنبيهات وإشعارات Toast
// ==========================================
function showToast(message, type = "success") {
    // تشغيل نغمة صوتية سريعة للتفاعل
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(type === "success" ? 880 : 440, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(type === "success" ? 1100 : 330, ctx.currentTime + 0.1);
        g.gain.setValueAtTime(0.25, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        o.start(ctx.currentTime);
        o.stop(ctx.currentTime + 0.4);
    } catch (e) {}

    const toast = document.getElementById('toast-notification');
    const toastTitle = document.getElementById('toast-title');
    const toastBody = document.getElementById('toast-msg-body');
    const toastIcon = toast.querySelector('.toast-icon');

    if (type === "success") {
        toastTitle.innerText = "تمت العملية بنجاح";
        toastIcon.innerText = "✅";
    } else {
        toastTitle.innerText = "فشلت العملية";
        toastIcon.innerText = "❌";
    }

    toastBody.innerText = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
}
