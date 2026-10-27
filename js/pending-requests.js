// ==========================================
//  إعدادات Supabase
// ==========================================
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

// ==========================================
//  تهيئة الصفحة
// ==========================================
let adminUser;

document.addEventListener('DOMContentLoaded', async () => {
    adminUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!adminUser || adminUser.role !== 'admin') {
        window.location.href = 'login.html';
        return;
    }

    // التحقق الفوري من رتبة المستخدم في السيرفر لمنع تزوير جلسات الدخول
    try {
        const { data: isValid, error: roleErr } = await _supabase.rpc('verify_session_role', {
            p_user_id: adminUser.id,
            p_expected_role: 'admin'
        });
        if (roleErr || !isValid) {
            localStorage.removeItem('currentUser');
            window.location.href = 'login.html';
            return;
        }
    } catch (_) {
        localStorage.removeItem('currentUser');
        window.location.href = 'login.html';
        return;
    }

    loadPendingRequests();
    checkDisputesBadge();
});

async function checkDisputesBadge() {
    try {
        const { count } = await _supabase
            .from('service_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'disputed');
        const badge = document.getElementById('disputes-tab-badge');
        if (badge) {
            if (count > 0) {
                badge.innerText = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch (e) {
        console.error(e);
    }
}

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
    document.getElementById('activate-rate').value = 260; // القيمة الافتراضية 260 دج
    
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

    if (!keyword || !rate) {
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
                show_campaigns_table: false, // لا يرى جدول الإعلانات افتراضياً
                show_payments_table: true // يرى جدول الدفعات افتراضياً
            })
            .eq('id', id);

        if (error) throw error;

        showToast(`تم تفعيل حساب الزبون (${name}) بنجاح!`, "success");
        closeActivationModal();
        loadPendingRequests();

        // فتح الواتساب تلقائياً للتواصل وتنبيه العميل بالتفعيل
        const phoneInput = document.getElementById('activate-phone');
        if (phoneInput && phoneInput.value) {
            const cleanPhone = phoneInput.value.replace(/\s+/g, '');
            const welcomeText = `مرحباً ${name}، يسعدني إعلامك بأنه تم تفعيل حسابك بنجاح على منصة AdVault لإدارة الإعلانات. يمكنك الآن تسجيل الدخول إلى حسابك باستخدام رقم هاتفك وكلمة المرور الخاصة بك.`;
            const encodedWelcome = encodeURIComponent(welcomeText);
            const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedWelcome}`;
            window.open(whatsappUrl, '_blank');
        }

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

// ==========================================
//  إدارة التبويبات والمزامنة لطلبات الشحن
// ==========================================
let activeTab = 'registrations';

function switchTab(tab) {
    activeTab = tab;
    const regBtn = document.getElementById('tab-registrations-btn');
    const depBtn = document.getElementById('tab-deposits-btn');
    const srvBtn = document.getElementById('tab-services-btn');
    const dspBtn = document.getElementById('tab-disputes-btn');
    
    const regSec = document.getElementById('registrations-section');
    const depSec = document.getElementById('deposits-section');
    const srvSec = document.getElementById('services-section');
    const dspSec = document.getElementById('disputes-section');
    
    // إعادة تعيين أزرار التبويبات
    [regBtn, depBtn, srvBtn, dspBtn].forEach(btn => {
        if (btn) btn.className = "px-5 py-3 text-sm font-bold border-b-2 border-transparent text-gray-500 hover:text-indigo-600 transition cursor-pointer flex items-center gap-1.5";
    });
    // إخفاء جميع الأقسام
    [regSec, depSec, srvSec, dspSec].forEach(sec => {
        if (sec) {
            sec.classList.remove('block');
            sec.classList.add('hidden');
        }
    });
    
    if (tab === 'registrations') {
        regBtn.className = "px-5 py-3 text-sm font-bold border-b-2 border-indigo-600 text-indigo-600 transition cursor-pointer flex items-center gap-1.5";
        regSec.classList.remove('hidden');
        regSec.classList.add('block');
        loadPendingRequests();
    } else if (tab === 'deposits') {
        depBtn.className = "px-5 py-3 text-sm font-bold border-b-2 border-indigo-600 text-indigo-600 transition cursor-pointer flex items-center gap-1.5";
        depSec.classList.remove('hidden');
        depSec.classList.add('block');
        loadPendingDeposits();
    } else if (tab === 'services') {
        srvBtn.className = "px-5 py-3 text-sm font-bold border-b-2 border-indigo-600 text-indigo-600 transition cursor-pointer flex items-center gap-1.5";
        srvSec.classList.remove('hidden');
        srvSec.classList.add('block');
        loadPendingServices();
    } else if (tab === 'disputes') {
        dspBtn.className = "px-5 py-3 text-sm font-bold border-b-2 border-indigo-600 text-indigo-600 transition cursor-pointer flex items-center gap-1.5";
        dspSec.classList.remove('hidden');
        dspSec.classList.add('block');
        loadPendingDisputes();
    }
}

window.switchTab = switchTab;

async function loadPendingDeposits() {
    const tableBody = document.getElementById('pending-deposits-table');
    const badge = document.getElementById('deposits-count-badge');
    
    tableBody.innerHTML = `
        <tr>
            <td colspan="6" class="p-8 text-center text-gray-400 font-bold">جاري تحميل الطلبات...</td>
        </tr>
    `;
    
    try {
        const { data: requests, error } = await _supabase
            .from('payment_requests')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        badge.innerText = `${requests.length} طلبات`;
        
        if (requests.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="p-8 text-center text-gray-400 font-bold">🎉 لا توجد أي طلبات شحن رصيد معلقة حالياً.</td>
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
            
            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-50/50 transition';
            row.innerHTML = `
                <td class="p-4 font-bold text-gray-800">${req.client_name}</td>
                <td class="p-4 font-mono font-bold text-center text-purple-700">$${parseFloat(req.amount_usd).toFixed(2)}</td>
                <td class="p-4 font-mono font-bold text-center text-emerald-600">${Math.round(req.amount_dzd).toLocaleString('fr-FR')} دج</td>
                <td class="p-4 text-center">
                    <button onclick="openScreenshotModal('${req.screenshot_base64}')" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold py-1.5 px-3 rounded-xl transition cursor-pointer">
                        👁️ عرض الإثبات
                    </button>
                </td>
                <td class="p-4 text-xs text-gray-400 font-semibold text-center">${formattedDate}</td>
                <td class="p-4 flex justify-center gap-2 flex-wrap">
                    <button onclick="approveDeposit('${req.id}', '${req.client_id}', '${req.client_name}', ${req.amount_usd}, ${req.amount_dzd})" 
                        class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-3.5 rounded-xl flex items-center gap-1 shadow-md shadow-green-600/10 cursor-pointer transition">
                        ✅ قبول الدفع
                    </button>
                    <button onclick="rejectDeposit('${req.id}')" 
                        class="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold py-2 px-3 rounded-xl flex items-center cursor-pointer transition">
                        ❌ رفض
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (err) {
        console.error("Error loading pending deposits:", err);
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="p-8 text-center text-red-500 font-bold">حدث خطأ أثناء تحميل البيانات من الخادم.</td>
            </tr>
        `;
    }
}

window.loadPendingDeposits = loadPendingDeposits;

function openScreenshotModal(base64Image) {
    document.getElementById('modal-screenshot-img').src = base64Image;
    document.getElementById('screenshot-modal').classList.remove('hidden');
}

function closeScreenshotModal() {
    document.getElementById('screenshot-modal').classList.add('hidden');
    document.getElementById('modal-screenshot-img').src = '';
}

window.openScreenshotModal = openScreenshotModal;
window.closeScreenshotModal = closeScreenshotModal;

async function approveDeposit(id, clientId, clientName, amountUsd, amountDzd) {
    const confirmApprove = confirm(`هل أنت متأكد من قبول إيداع بقيمة $${amountUsd} (${amountDzd.toLocaleString('fr-FR')} دج) للزبون (${clientName})؟`);
    if (!confirmApprove) return;
    
    try {
        // 1. تحديث حالة الطلب إلى approved
        const { error: reqErr } = await _supabase
            .from('payment_requests')
            .update({ status: 'approved', processed_at: new Date().toISOString() })
            .eq('id', id);
            
        if (reqErr) throw reqErr;
        
        // 2. إدخال دفعة جديدة في جدول payments
        const { data: newPayment, error: payErr } = await _supabase
            .from('payments')
            .insert([{
                client_id: clientId,
                amount_dzd: amountDzd,
                amount_euro: amountUsd,
                note: "شحن رصيد تلقائي (Redotpay)",
                date: new Date().toISOString().split('T')[0]
            }])
            .select().single();
            
        if (payErr) throw payErr;
        
        // 3. حساب وتوزيع الأرباح وأرشفتها في profits_archive لتحديث لوحة تحليلات الأدمن
        const adCapital = parseFloat((amountDzd * 0.8).toFixed(2));
        const totalProfit = parseFloat((amountDzd - adCapital).toFixed(2));
        const companyProfit = parseFloat((totalProfit * 0.30).toFixed(2));
        const myProfit = parseFloat((totalProfit * 0.70).toFixed(2));
        
        const { error: arcErr } = await _supabase
            .from('profits_archive')
            .insert([{
                payment_id: newPayment.id,
                client_name: clientName,
                amount_received: amountDzd,
                ad_capital: adCapital,
                total_profit: totalProfit,
                company_profit: companyProfit,
                my_profit: myProfit
            }]);
            
        if (arcErr) console.error("فشل ترحيل الأرباح للدفعة المقبولة:", arcErr);
        
        // 4. تحديث تلقائي للخزائن الثلاث وحركات الخزينة
        try {
            const { data: vault } = await _supabase
                .from('company_vaults')
                .select('*')
                .eq('id', '00000000-0000-0000-0000-000000000000')
                .maybeSingle();

            if (vault) {
                const addCompany = adCapital + companyProfit;
                const addPersonal = myProfit;

                await _supabase
                    .from('company_vaults')
                    .update({
                        company_dzd_balance: parseFloat(vault.company_dzd_balance || 0) + addCompany,
                        my_dzd_balance: parseFloat(vault.my_dzd_balance || 0) + addPersonal,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', '00000000-0000-0000-0000-000000000000');

                // تسجيل حركة الخزينة للشركة وللأدمن
                await _supabase
                    .from('vault_ledger')
                    .insert([
                        {
                            vault_type: 'company',
                            action_type: 'recharge_income',
                            amount_dzd: addCompany,
                            notes: `شحن للزبون (${clientName}) - رأس مال ${adCapital} دج + أرباح 30% تعادل ${companyProfit} دج`
                        },
                        {
                            vault_type: 'personal',
                            action_type: 'recharge_income',
                            amount_dzd: addPersonal,
                            notes: `أرباح 70% للزبون (${clientName})`
                        }
                    ]);
            }
        } catch (eVault) {
            console.error("Failed to auto-update vaults on approval:", eVault);
        }

        showToast(`تم قبول الدفع وإضافة $${amountUsd} بنجاح لحساب (${clientName})!`, "success");
        loadPendingDeposits();
        
        // فتح الواتساب تلقائياً لتأكيد شحن الرصيد للزبون
        try {
            const { data: clientData } = await _supabase
                .from('clients')
                .select('phone')
                .eq('id', clientId)
                .maybeSingle();
                
            if (clientData && clientData.phone) {
                const cleanPhone = clientData.phone.replace(/\s+/g, '');
                const confirmText = `مرحباً ${clientName}، تم تأكيد وقبول عملية الشحن الخاصة بك بقيمة $${amountUsd} (${amountDzd.toLocaleString('fr-FR')} دج). تم إضافة الرصيد إلى حسابك بنجاح. شكراً لتعاملك معنا!`;
                const encodedConfirm = encodeURIComponent(confirmText);
                const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedConfirm}`;
                window.open(whatsappUrl, '_blank');
            }
        } catch (e) {
            console.error("Failed to redirect to WhatsApp:", e);
        }
        
    } catch (err) {
        console.error("Error approving deposit:", err);
        showToast("حدث خطأ أثناء معالجة الطلب وقبول الدفعة", "error");
    }
}

async function rejectDeposit(id) {
    const confirmReject = confirm("هل أنت متأكد من رفض طلب الشحن المعلق هذا؟");
    if (!confirmReject) return;
    
    try {
        const { error } = await _supabase
            .from('payment_requests')
            .update({ status: 'rejected', processed_at: new Date().toISOString() })
            .eq('id', id);
            
        if (error) throw error;
        
        showToast("تم رفض طلب الشحن بنجاح.", "success");
        loadPendingDeposits();
        
    } catch (err) {
        console.error("Error rejecting deposit:", err);
        showToast("حدث خطأ أثناء رفض الطلب", "error");
    }
}

window.approveDeposit = approveDeposit;
window.rejectDeposit = rejectDeposit;

async function loadPendingServices() {
    const tableBody = document.getElementById('pending-services-table');
    const badge = document.getElementById('services-count-badge');
    
    tableBody.innerHTML = `
        <tr>
            <td colspan="5" class="p-8 text-center text-gray-400 font-bold">جاري تحميل الطلبات...</td>
        </tr>
    `;
    
    try {
        const { data: requests, error } = await _supabase
            .from('service_requests')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        badge.innerText = `${requests.length} طلبات`;
        
        if (requests.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="p-8 text-center text-gray-400 font-bold">🎉 لا توجد أي طلبات خدمات معلقة حالياً.</td>
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
            
            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-50/50 transition';
            row.innerHTML = `
                <td class="p-4 font-bold text-gray-800">${req.client_name}</td>
                <td class="p-4 font-bold text-indigo-700">${req.service_title}</td>
                <td class="p-4 font-mono font-bold text-center text-purple-700">${req.price_usd === 0 ? 'مجاناً' : `$${parseFloat(req.price_usd).toFixed(2)}`}</td>
                <td class="p-4 text-xs text-gray-400 font-semibold text-center">${formattedDate}</td>
                <td class="p-4 flex justify-center gap-2 flex-wrap">
                    <button onclick="approveService('${req.id}', '${req.client_id}', '${req.client_name}', '${req.service_title}', ${req.price_usd})" 
                        class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-3.5 rounded-xl flex items-center gap-1 shadow-md shadow-green-600/10 cursor-pointer transition">
                        ✅ قبول وتفعيل
                    </button>
                    <button onclick="rejectService('${req.id}', '${req.client_name}', '${req.service_title}')" 
                        class="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold py-2 px-3 rounded-xl flex items-center cursor-pointer transition">
                        ❌ رفض
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (err) {
        console.error("Error loading pending services:", err);
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="p-8 text-center text-red-500 font-bold">حدث خطأ أثناء تحميل البيانات من الخادم.</td>
            </tr>
        `;
    }
}

window.loadPendingServices = loadPendingServices;

async function approveService(id, clientId, clientName, serviceTitle, priceUsd) {
    const confirmApprove = confirm(`هل أنت متأكد من قبول طلب خدمة (${serviceTitle}) للزبون (${clientName})؟ سيتم خصم $${priceUsd} من رصيده.`);
    if (!confirmApprove) return;
    
    try {
        // 1. جلب بيانات الزبون وسعر صرفه لخصم المقدار بالدينار بشكل صحيح
        const { data: client, error: clErr } = await _supabase
            .from('clients')
            .select('*')
            .eq('id', clientId)
            .single();
            
        if (clErr) throw clErr;
        
        // 2. تحديث حالة الطلب إلى approved
        const { error: reqErr } = await _supabase
            .from('service_requests')
            .update({ status: 'approved', processed_at: new Date().toISOString() })
            .eq('id', id);
            
        if (reqErr) throw reqErr;
        
        // 3. خصم القيمة بإدخال قيمة سالبة في جدول payments
        if (priceUsd > 0) {
            const rate = client.exchange_rate || 230;
            const amountDzd = Math.round(priceUsd * rate);
            
            const { error: payErr } = await _supabase
                .from('payments')
                .insert([{
                    client_id: clientId,
                    amount_dzd: -amountDzd, // خصم بالدينار
                    amount_euro: -priceUsd, // خصم بالدولار
                    note: `خصم مقابل خدمة: ${serviceTitle}`,
                    date: new Date().toISOString().split('T')[0]
                }]);
                
            if (payErr) throw payErr;
        }
        
        showToast(`تم تفعيل الخدمة (${serviceTitle}) وخصم القيمة بنجاح!`, "success");
        loadPendingServices();
        
        // 4. فتح الواتساب تلقائياً لتنبيه الزبون
        if (client.phone) {
            const cleanPhone = client.phone.replace(/\s+/g, '');
            const msg = `مرحباً ${clientName}، يسعدني إعلامك بأنه تم قبول وتفعيل طلبك للحصول على خدمة (${serviceTitle}) بنجاح. ${priceUsd > 0 ? `تم خصم بقيمة $${priceUsd} من رصيدك في المنصة.` : ''}`;
            const encoded = encodeURIComponent(msg);
            const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encoded}`;
            window.open(whatsappUrl, '_blank');
        }
        
    } catch (err) {
        console.error("Error approving service:", err);
        showToast("حدث خطأ أثناء معالجة الطلب وخصم القيمة", "error");
    }
}

window.approveService = approveService;

async function rejectService(id, clientName, serviceTitle) {
    const confirmReject = confirm(`هل أنت متأكد من رفض طلب خدمة (${serviceTitle}) للزبون (${clientName})؟`);
    if (!confirmReject) return;
    
    try {
        const { error } = await _supabase
            .from('service_requests')
            .update({ status: 'rejected', processed_at: new Date().toISOString() })
            .eq('id', id);
            
        if (error) throw error;
        
        showToast(`تم رفض طلب الخدمة بنجاح.`, "success");
        loadPendingServices();
        
    } catch (err) {
        console.error("Error rejecting service request:", err);
        showToast("حدث خطأ أثناء رفض الطلب", "error");
    }
}

window.rejectService = rejectService;

// ==========================================
//  نظام النزاعات والاعتراضات (حل النزاع للأدمن)
// ==========================================
async function loadPendingDisputes() {
    const tableBody = document.getElementById('pending-disputes-table');
    const badge = document.getElementById('disputes-count-badge');
    
    tableBody.innerHTML = `
        <tr>
            <td colspan="6" class="p-8 text-center text-gray-400 font-bold">جاري تحميل النزاعات...</td>
        </tr>
    `;
    
    try {
        const { data: requests, error } = await _supabase
            .from('service_requests')
            .select('*')
            .eq('status', 'disputed')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        badge.innerText = `${requests.length} نزاعات`;
        
        const dspBadge = document.getElementById('disputes-tab-badge');
        if (dspBadge) {
            if (requests.length > 0) {
                dspBadge.innerText = requests.length;
                dspBadge.classList.remove('hidden');
            } else {
                dspBadge.classList.add('hidden');
            }
        }
        
        if (requests.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="p-8 text-center text-gray-400 font-bold">🎉 لا توجد أي نزاعات نشطة حالياً.</td>
                </tr>
            `;
            return;
        }
        
        // جلب مقدمي الخدمات للتواصل
        const { data: partners } = await _supabase
            .from('clients')
            .select('id, name, phone');

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
            
            const partner = (partners || []).find(p => p.id === req.provider_id);
            const providerName = partner?.name || 'شريك غير معرف';
            const providerPhone = partner?.phone || '';

            // العثور على هاتف الزبون
            const clientObj = (partners || []).find(p => p.id === req.client_id);
            const clientPhoneVal = clientObj?.phone || '';
            
            const row = document.createElement('tr');
            row.className = 'hover:bg-red-50/20 transition';
            row.innerHTML = `
                <td class="p-4 font-bold text-gray-800">${req.client_name}</td>
                <td class="p-4 font-bold text-gray-850">${providerName}</td>
                <td class="p-4 font-bold text-indigo-700">${req.service_title}</td>
                <td class="p-4 text-red-650 font-semibold text-xs max-w-xs truncate" title="${req.dispute_reason}">${req.dispute_reason}</td>
                <td class="p-4 font-mono font-bold text-center text-purple-700">$${parseFloat(req.price_usd).toFixed(2)}</td>
                <td class="p-4 flex justify-center gap-1.5 flex-wrap">
                    <button onclick="openResolveDisputeModal('${req.id}', '${req.service_title}', ${req.price_usd}, '${req.provider_id}', '${req.client_id}', '${req.client_name}')" 
                        class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 px-3 rounded-xl flex items-center gap-1 shadow-md cursor-pointer transition">
                        ⚖️ اتخاذ القرار وحل النزاع
                    </button>
                    <a href="https://wa.me/${clientPhoneVal.replace(/\s+/g, '')}" target="_blank"
                        class="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-[10px] font-bold py-1.5 px-2.5 rounded-xl cursor-pointer transition">
                        💬 واتساب الزبون
                    </a>
                    <a href="https://wa.me/${providerPhone.replace(/\s+/g, '')}" target="_blank"
                        class="bg-pink-50 hover:bg-pink-100 text-pink-700 text-[10px] font-bold py-1.5 px-2.5 rounded-xl cursor-pointer transition">
                        💬 واتساب الشريك
                    </a>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (err) {
        console.error("Error loading pending disputes:", err);
    }
}

function openResolveDisputeModal(reqId, serviceTitle, priceUsd, providerId, clientId, clientName) {
    document.getElementById('resolve-dispute-req-id').value = reqId;
    document.getElementById('resolve-dispute-price').value = priceUsd;
    document.getElementById('resolve-dispute-provider-id').value = providerId;
    document.getElementById('resolve-dispute-client-id').value = clientId;
    document.getElementById('resolve-dispute-service-title').value = serviceTitle;
    
    document.getElementById('resolve-dispute-modal').classList.remove('hidden');
}

function closeResolveDisputeModal() {
    document.getElementById('resolve-dispute-modal').classList.add('hidden');
}

async function submitDisputeResolution() {
    const reqId = document.getElementById('resolve-dispute-req-id').value;
    const priceUsd = parseFloat(document.getElementById('resolve-dispute-price').value || 0);
    const providerId = document.getElementById('resolve-dispute-provider-id').value;
    const clientId = document.getElementById('resolve-dispute-client-id').value;
    const serviceTitle = document.getElementById('resolve-dispute-service-title').value;
    
    // الإجراء المختار
    const action = document.querySelector('input[name="resolve-action"]:checked').value;
    
    try {
        if (action === 'accept') {
            // خيار أ: قبول تسليم العمل وصرف المستحقات للشريك
            // 1. تحديث حالة الطلب لمكتمل
            const { error: reqErr } = await _supabase
                .from('service_requests')
                .update({ status: 'completed', processed_at: new Date().toISOString() })
                .eq('id', reqId);
            if (reqErr) throw reqErr;
            
            // 2. إضافة الأرباح لمحفظة الشريك
            if (providerId && providerId !== 'null' && providerId !== '') {
                const { data: wallet } = await _supabase
                    .from('provider_wallets')
                    .select('*')
                    .eq('provider_id', providerId)
                    .maybeSingle();

                if (wallet) {
                    const newCompleted = (wallet.completed_requests || 0) + 1;
                    const newRev = parseFloat(wallet.total_revenue_usd || 0) + priceUsd;
                    const newBal = parseFloat(wallet.payout_balance_usd || 0) + priceUsd;

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
            showToast("تم إكمال تسليم الخدمة بنجاح وصرف المستحقات للشريك.", "success");
            
        } else if (action === 'redo') {
            // خيار ب: إعادة المشروع للشريك للتعديل
            // تحديث حالة الطلب إلى "قيد التنفيذ" (in_progress)
            const { error: reqErr } = await _supabase
                .from('service_requests')
                .update({ status: 'in_progress', dispute_reason: null, processed_at: new Date().toISOString() })
                .eq('id', reqId);
            if (reqErr) throw reqErr;
            
            showToast("تم إعادة توجيه الطلب للشريك لمراجعة العمل وإجراء التعديلات.", "success");
            
        } else if (action === 'refund') {
            // خيار ج: رفض الخدمة كلياً وإرجاع المال للزبون
            // تحديث حالة الطلب إلى rejected (مرفوض) مما يلغي حجز الرصيد تلقائياً للزبون
            const { error: reqErr } = await _supabase
                .from('service_requests')
                .update({ status: 'rejected', processed_at: new Date().toISOString() })
                .eq('id', reqId);
            if (reqErr) throw reqErr;
            
            showToast("تم إلغاء وحذف طلب الخدمة بنجاح وإرجاع الرصيد المحجوز لحساب الزبون.", "success");
        }
        
        closeResolveDisputeModal();
        loadPendingDisputes();
    } catch (err) {
        console.error("Error resolving dispute:", err);
        showToast("حدث خطأ أثناء تنفيذ تسوية النزاع.", "error");
    }
}

window.loadPendingDisputes = loadPendingDisputes;
window.openResolveDisputeModal = openResolveDisputeModal;
window.closeResolveDisputeModal = closeResolveDisputeModal;
window.submitDisputeResolution = submitDisputeResolution;
