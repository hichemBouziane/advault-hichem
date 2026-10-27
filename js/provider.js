// ==========================================
//  إعدادات Supabase والتحقق من الجلسة
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

const providerUser = JSON.parse(localStorage.getItem('currentUser'));
if (!providerUser || providerUser.role !== 'provider') {
    window.location.href = 'login.html';
}

// متغيرات حفظ الحالة العامة
let walletData = { total_requests: 0, completed_requests: 0, rejected_requests: 0, payout_balance_usd: 0 };
let providerRequests = [];
let providerServices = [];

document.addEventListener('DOMContentLoaded', async () => {
    // ترحيب باسم مقدم الخدمة
    document.getElementById('user-welcome').innerText = `مرحباً، ${providerUser.name || 'شريكنا الكريم'}`;
    
    // شحن البيانات
    await ensureWalletExists();
    await loadWalletStats();
    await loadRequests();
    await loadServices();
    await loadPayoutHistory();
    await checkTelegramStatus();
    await loadProviderRedotPaySettings();
});

// ==========================================
//  التنقل بين التبويبات
// ==========================================
function switchTab(tabName) {
    const dash = document.getElementById('dashboard-view');
    const srvs = document.getElementById('services-view');
    const pays = document.getElementById('payouts-view');
    const sett = document.getElementById('settings-view');

    dash.classList.add('hidden');
    srvs.classList.add('hidden');
    pays.classList.add('hidden');
    if (sett) sett.classList.add('hidden');

    if (tabName === 'dashboard') {
        dash.classList.remove('hidden');
        loadRequests();
    } else if (tabName === 'services') {
        srvs.classList.remove('hidden');
        loadServices();
    } else if (tabName === 'payouts') {
        pays.classList.remove('hidden');
        loadPayoutHistory();
        loadWalletStats();
    } else if (tabName === 'settings') {
        if (sett) {
            sett.classList.remove('hidden');
            checkTelegramStatus();
        }
    }

    // إغلاق القائمة الجانبية في الهاتف تلقائياً
    if (typeof closeMenu === 'function') closeMenu();
}

window.switchTab = switchTab;

// ==========================================
//  تهيئة محفظة الأرباح (إن لم تكن موجودة)
// ==========================================
async function ensureWalletExists() {
    try {
        const { data, error } = await _supabase
            .from('provider_wallets')
            .select('*')
            .eq('provider_id', providerUser.id)
            .maybeSingle();

        if (!data) {
            // إنشاء محفظة افتراضية للشريك
            await _supabase
                .from('provider_wallets')
                .insert([{
                    provider_id: providerUser.id,
                    total_requests: 0,
                    completed_requests: 0,
                    rejected_requests: 0,
                    total_revenue_usd: 0,
                    payout_balance_usd: 0
                }]);
        }
    } catch (e) {
        console.error("Wallet setup error:", e);
    }
}

// ==========================================
//  تحميل إحصائيات المحفظة
// ==========================================
async function loadWalletStats() {
    try {
        const { data, error } = await _supabase
            .from('provider_wallets')
            .select('*')
            .eq('provider_id', providerUser.id)
            .single();

        // جلب كل طلبات العمل لحساب الإحصائيات الحقيقية ديناميكياً
        const { data: allReqs } = await _supabase
            .from('service_requests')
            .select('status, price_usd, created_at')
            .eq('provider_id', providerUser.id);

        const totalReqsCount = allReqs ? allReqs.length : 0;
        const completedReqsCount = allReqs ? allReqs.filter(r => r.status === 'completed').length : 0;
        const rejectedReqsCount = allReqs ? allReqs.filter(r => r.status === 'rejected').length : 0;

        // حساب الرصيد المعلق للطلبات النشطة (بانتظار العمل، التفاهم، التنفيذ، التسليم، أو تحت النزاع)
        const lockedBalanceUsd = allReqs 
            ? allReqs.filter(r => ['pending', 'agreement', 'in_progress', 'delivered', 'disputed'].includes(r.status))
                     .reduce((sum, item) => sum + parseFloat(item.price_usd || 0), 0)
            : 0;

        if (data) {
            walletData = data;
            document.getElementById('wallet-balance').innerText = `$${parseFloat(data.payout_balance_usd || 0).toFixed(2)}`;
            document.getElementById('payout-balance-val').innerText = `$${parseFloat(data.payout_balance_usd || 0).toFixed(2)}`;
            document.getElementById('wallet-locked-balance').innerText = `$${lockedBalanceUsd.toFixed(2)}`;
            document.getElementById('wallet-total-requests').innerText = totalReqsCount;
            document.getElementById('wallet-completed-requests').innerText = completedReqsCount;
            document.getElementById('wallet-rejected-requests').innerText = rejectedReqsCount;
        }

        // تحديث الرسوم البيانية والإحصائية
        if (allReqs) {
            updateProviderCharts(allReqs);
        }
    } catch (e) {
        console.error("Error loading wallet:", e);
    }
}

// ==========================================
//  تحميل طلبات العمل الواردة
// ==========================================
// ==========================================
//  تحميل طلبات العمل الواردة
// ==========================================
async function loadRequests() {
    const tbody = document.getElementById('provider-requests-table');
    const badge = document.getElementById('requests-count-badge');

    try {
        const { data, error } = await _supabase
            .from('service_requests')
            .select('*')
            .eq('provider_id', providerUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        providerRequests = data || [];
        badge.innerText = `${providerRequests.length} طلب`;

        if (providerRequests.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="p-8 text-center text-gray-400 font-bold">✨ لا توجد أي طلبات عمل واردة حالياً.</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = '';
        providerRequests.forEach(req => {
            const dateStr = new Date(req.created_at).toLocaleDateString('ar-DZ', { day: 'numeric', month: 'short' });
            
            // حساب تاريخ التسليم والتأخير
            let expectedDelivery = '-';
            let isDelayed = false;
            if (req.due_at) {
                const dueDate = new Date(req.due_at);
                expectedDelivery = dueDate.toLocaleDateString('ar-DZ', { day: 'numeric', month: 'short' });
                
                // فحص التأخير
                if (req.status === 'in_progress' && new Date() > dueDate) {
                    isDelayed = true;
                }
            }

            // شارات الحالة
            let statusBadge = '';
            if (req.status === 'pending') {
                statusBadge = `<span class="bg-gray-100 text-gray-650 border border-gray-200 text-[10px] font-bold px-2 py-0.5 rounded-lg">قيد الانتظار</span>`;
            } else if (req.status === 'agreement') {
                statusBadge = `<span class="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold px-2 py-0.5 rounded-lg">مرحلة التفاهم والاتفاق</span>`;
            } else if (req.status === 'in_progress') {
                if (isDelayed) {
                    statusBadge = `<span class="bg-red-105 text-red-700 border border-red-200 text-[10px] font-black px-2 py-0.5 rounded-lg animate-pulse">متأخر عن اللزوم ⚠️</span>`;
                } else {
                    statusBadge = `<span class="bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-bold px-2 py-0.5 rounded-lg">قيد العمل والتنفيذ</span>`;
                }
            } else if (req.status === 'delivered') {
                statusBadge = `<span class="bg-purple-100 text-purple-800 border border-purple-200 text-[10px] font-bold px-2 py-0.5 rounded-lg">تم التسليم (بانتظار تأكيد الزبون) ⏳</span>`;
            } else if (req.status === 'completed') {
                statusBadge = `<span class="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded-lg">مكتمل ومستلم نهائياً ✅</span>`;
            } else if (req.status === 'disputed') {
                statusBadge = `<span class="bg-red-50 text-red-750 border border-red-100 text-[10px] font-bold px-2 py-0.5 rounded-lg">معترض عليه (نزاع معلق) ⚠️</span>`;
            } else {
                statusBadge = `<span class="bg-red-50 text-red-655 border border-red-100 text-[10px] font-bold px-2 py-0.5 rounded-lg">مرفوض ❌</span>`;
            }

            // أزرار التحكم بالطلب والدردشة
            let actionsHtml = '';
            let chatBtnHtml = `<button onclick="openChatFromProvider('${req.id}')" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[9px] py-1 px-2.5 rounded-lg transition inline-block text-center mt-1.5 cursor-pointer">💬 فتح الشات</button>`;

            if (req.status === 'pending') {
                actionsHtml = `
                    <div class="flex flex-col items-center justify-center gap-1">
                        <div class="flex justify-center gap-1.5">
                            <button onclick="startAgreement('${req.id}', '${req.service_title}')"
                                class="bg-indigo-600 hover:bg-indigo-750 text-white font-bold text-[10px] py-1.5 px-3 rounded-lg cursor-pointer transition">
                                🤝 بدء التفاهم
                            </button>
                            <button onclick="openRejectModal('${req.id}')"
                                class="bg-red-50 hover:bg-red-100 text-red-655 font-bold text-[10px] py-1.5 px-3 rounded-lg cursor-pointer transition">
                                ❌ رفض
                            </button>
                        </div>
                    </div>
                `;
            } else if (req.status === 'agreement') {
                actionsHtml = `
                    <div class="flex flex-col items-center justify-center gap-1">
                        <button onclick="startWork('${req.id}', '${req.service_title}', '${req.service_id}')"
                            class="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] py-1.5 px-4 rounded-lg cursor-pointer transition">
                            🚀 بدء العمل والتنفيذ
                        </button>
                        ${chatBtnHtml}
                    </div>
                `;
            } else if (req.status === 'in_progress') {
                actionsHtml = `
                    <div class="flex flex-col items-center gap-1.5 justify-center">
                        <button onclick="openDeliverWorkModal('${req.id}')"
                            class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] py-1.5 px-4 rounded-lg cursor-pointer transition">
                            🏆 تسليم العمل للزبون
                        </button>
                        ${isDelayed ? '<span class="text-[9px] text-red-600 font-bold animate-pulse">⚠️ يجب إكمال الخدمة اليوم!</span>' : ''}
                        ${chatBtnHtml}
                    </div>
                `;
            } else if (req.status === 'disputed') {
                actionsHtml = `
                    <div class="flex flex-col items-center gap-1 justify-center">
                        <span class="text-[10px] text-red-700 font-bold block">سبب الاعتراض: ${req.dispute_reason || 'غير محدد'}</span>
                        ${chatBtnHtml}
                    </div>
                `;
            } else {
                actionsHtml = `
                    <div class="flex flex-col items-center justify-center">
                        ${chatBtnHtml}
                    </div>
                `;
            }

            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-50/50 transition border-b border-slate-50';
            row.innerHTML = `
                <td class="p-4 font-bold text-gray-800">${req.client_name}</td>
                <td class="p-4 font-semibold text-gray-600 text-xs">${req.service_title}</td>
                <td class="p-4 text-center font-bold text-indigo-700">$${parseFloat(req.price_usd || 0).toFixed(2)}</td>
                <td class="p-4 text-center text-gray-500 font-semibold text-xs">${expectedDelivery}</td>
                <td class="p-4 text-center">${statusBadge}</td>
                <td class="p-4 text-center">${actionsHtml}</td>
            `;
            tbody.appendChild(row);
        });

    } catch (e) {
        console.error("Error loading requests:", e);
    }
}

// ==========================================
//  قبول وإكمال ورفض الطلبات (دورة الحياة الجديدة)
// ==========================================
async function startAgreement(reqId, serviceTitle) {
    if (!confirm(`هل تريد البدء في التفاهم والاتفاق مع الزبون حول تفاصيل خدمة (${serviceTitle})؟`)) return;

    try {
        const { error } = await _supabase
            .from('service_requests')
            .update({ status: 'agreement' })
            .eq('id', reqId);

        if (error) throw error;

        // تحديث إحصائيات المحفظة (الطلبات الكلية)
        await _supabase
            .from('provider_wallets')
            .update({ total_requests: walletData.total_requests + 1 })
            .eq('provider_id', providerUser.id);

        // جلب معرف تليجرام للزبون لإرسال التنبيه له
        let clientChatId = null;
        try {
            const { data: reqDetails } = await _supabase
                .from('service_requests')
                .select('client_id')
                .eq('id', reqId)
                .single();
                
            if (reqDetails && reqDetails.client_id) {
                const { data: clientObj } = await _supabase
                    .from('clients')
                    .select('telegram_chat_id')
                    .eq('id', reqDetails.client_id)
                    .single();
                if (clientObj && clientObj.telegram_chat_id) {
                    clientChatId = clientObj.telegram_chat_id;
                }
            }
        } catch (errClient) {
            console.error("Failed to get client chat ID for agreement:", errClient);
        }

        showToast("تم تحويل الطلب لمرحلة الاتفاق والتفاهم مع الزبون بنجاح!", "success");
        loadRequests();
        loadWalletStats();

        // إرسال تنبيه تلجرام
        const agreementMsg = `🤝 الشريك (${providerUser.name}) بدأ التفاهم معك حول طلب الخدمة:\n📦 الخدمة: ${serviceTitle}\nيرجى متابعة المحادثة في الموقع.`;
        await sendTelegramNotification(agreementMsg, clientChatId);

    } catch (e) {
        console.error(e);
        showToast("حدث خطأ أثناء الانتقال لمرحلة التفاهم.", "error");
    }
}

async function startWork(reqId, serviceTitle, serviceId) {
    if (!confirm(`هل قمت بالاتفاق بالكامل وتريد بدء العمل الفعلي على المشروع الآن؟\nسيتم احتساب مدة التسليم المتوقعة بدءاً من اليوم.`)) return;

    try {
        // 1. جلب مدة التنفيذ الافتراضية للخدمة من جدول الخدمات
        let durationDays = 3; // افتراضي
        if (serviceId && serviceId !== 'null' && serviceId !== '') {
            const { data: srv } = await _supabase
                .from('services')
                .select('duration_days')
                .eq('id', serviceId)
                .maybeSingle();
            if (srv && srv.duration_days) {
                durationDays = parseInt(srv.duration_days);
            }
        }

        // 2. حساب تواريخ البداية والنهاية
        const startedAt = new Date();
        const dueAt = new Date();
        dueAt.setDate(startedAt.getDate() + durationDays);

        // 3. تحديث الطلب
        const { error } = await _supabase
            .from('service_requests')
            .update({
                status: 'in_progress',
                started_at: startedAt.toISOString(),
                due_at: dueAt.toISOString()
            })
            .eq('id', reqId);

        if (error) throw error;

        // جلب معرف تليجرام للزبون لإرسال التنبيه له
        let clientChatId = null;
        try {
            const { data: reqDetails } = await _supabase
                .from('service_requests')
                .select('client_id')
                .eq('id', reqId)
                .single();
                
            if (reqDetails && reqDetails.client_id) {
                const { data: clientObj } = await _supabase
                    .from('clients')
                    .select('telegram_chat_id')
                    .eq('id', reqDetails.client_id)
                    .single();
                if (clientObj && clientObj.telegram_chat_id) {
                    clientChatId = clientObj.telegram_chat_id;
                }
            }
        } catch (errClient) {
            console.error("Failed to get client chat ID for work start:", errClient);
        }

        showToast(`تم بدء العمل بنجاح! مدة التسليم المتوقعة: ${durationDays} أيام.`, "success");
        loadRequests();

        // إرسال تنبيه تلجرام
        const workMsg = `🚀 الشريك (${providerUser.name}) بدأ تنفيذ العمل لطلب:\n📦 الخدمة: ${serviceTitle}\n📅 مدة التسليم: ${durationDays} أيام (تاريخ الاستحقاق: ${dueAt.toLocaleDateString('ar-DZ')})`;
        await sendTelegramNotification(workMsg, clientChatId);

    } catch (e) {
        console.error(e);
        showToast("حدث خطأ أثناء بدء تنفيذ العمل.", "error");
    }
}

function openDeliverWorkModal(reqId) {
    document.getElementById('deliver-request-id').value = reqId;
    document.getElementById('deliver-file-input').value = '';
    document.getElementById('deliver-notes').value = '';
    document.getElementById('deliver-work-modal').classList.remove('hidden');
}

function closeDeliverWorkModal() {
    document.getElementById('deliver-work-modal').classList.add('hidden');
}

async function submitWorkDelivery(event) {
    if (event) event.preventDefault();
    const reqId = document.getElementById('deliver-request-id').value;
    const fileInput = document.getElementById('deliver-file-input');
    const notes = document.getElementById('deliver-notes').value.trim();
    const submitBtn = document.getElementById('deliver-submit-btn');

    const file = fileInput.files[0];
    if (!file) {
        alert("يرجى اختيار ملف التسليم أولاً.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "⏳ جاري رفع الملف وتسليم العمل...";

    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `deliveries/${reqId}/${fileName}`;

        const { data: uploadData, error: uploadErr } = await _supabase.storage
            .from('vault-attachments')
            .upload(filePath, file);

        if (uploadErr) throw uploadErr;

        const { data: urlData } = _supabase.storage
            .from('vault-attachments')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        const { error: updateErr } = await _supabase
            .from('service_requests')
            .update({
                status: 'delivered',
                delivery_file_url: publicUrl,
                delivery_notes: notes,
                delivered_at: new Date().toISOString()
            })
            .eq('id', reqId);

        if (updateErr) throw updateErr;

        showToast("تم تسليم العمل وملف المشروع للزبون بنجاح! بانتظار مراجعته وقبوله الاستلام.", "success");
        closeDeliverWorkModal();
        loadRequests();

        const reqObj = providerRequests.find(r => r.id === reqId);
        const serviceTitle = reqObj ? reqObj.service_title : "خدمة مخصصة";
        const clientId = reqObj ? reqObj.client_id : null;

        let clientChatId = null;
        if (clientId) {
            try {
                const { data: clientObj } = await _supabase
                    .from('clients')
                    .select('telegram_chat_id')
                    .eq('id', clientId)
                    .single();
                if (clientObj && clientObj.telegram_chat_id) {
                    clientChatId = clientObj.telegram_chat_id;
                }
            } catch (errClient) {
                console.error("Failed to get client chat ID for delivery:", errClient);
            }
        }

        const deliveryMsg = `🏆 الشريك (${providerUser.name}) قام بتسليم العمل النهائي لطلب:\n📦 الخدمة: ${serviceTitle}\n📝 ملاحظات: ${notes}\n💾 رابط الملف: ${publicUrl}\n\nيرجى مراجعة وقبول الطلب من لوحة التحكم الخاصة بك.`;
        await sendTelegramNotification(deliveryMsg, clientChatId);

    } catch (e) {
        console.error("Error delivering work:", e);
        showToast("حدث خطأ أثناء رفع الملف أو تحديث حالة التسليم.", "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "🚀 تسليم العمل النهائي";
    }
}

function openRejectModal(reqId) {
    document.getElementById('reject-request-id').value = reqId;
    document.getElementById('reject-reason').value = '';
    document.getElementById('reject-modal').classList.remove('hidden');
}

function closeRejectModal() {
    document.getElementById('reject-modal').classList.add('hidden');
}

async function submitReject(e) {
    e.preventDefault();
    const reqId = document.getElementById('reject-request-id').value;
    const reason = document.getElementById('reject-reason').value.trim();

    try {
        const { error } = await _supabase
            .from('service_requests')
            .update({
                status: 'rejected',
                reject_reason: reason
            })
            .eq('id', reqId);

        if (error) throw error;

        // تحديث الرفض في المحفظة
        await _supabase
            .from('provider_wallets')
            .update({ rejected_requests: walletData.rejected_requests + 1 })
            .eq('provider_id', providerUser.id);

        const reqObj = providerRequests.find(r => r.id === reqId);
        const serviceTitle = reqObj ? reqObj.service_title : "خدمة مخصصة";
        const clientId = reqObj ? reqObj.client_id : null;

        let clientChatId = null;
        if (clientId) {
            try {
                const { data: clientObj } = await _supabase
                    .from('clients')
                    .select('telegram_chat_id')
                    .eq('id', clientId)
                    .single();
                if (clientObj && clientObj.telegram_chat_id) {
                    clientChatId = clientObj.telegram_chat_id;
                }
            } catch (errClient) {
                console.error("Failed to get client chat ID for reject:", errClient);
            }
        }

        showToast("تم رفض الطلب وإبلاغ العميل بالسبب.", "success");
        closeRejectModal();
        loadRequests();
        loadWalletStats();

        const rejectMsg = `❌ الشريك (${providerUser.name}) قام برفض طلب الخدمة:\n📦 الخدمة: ${serviceTitle}\n💬 السبب: ${reason}`;
        await sendTelegramNotification(rejectMsg, clientChatId);

    } catch (e) {
        console.error(e);
        showToast("حدث خطأ أثناء الرفض.", "error");
    }
}

window.startAgreement = startAgreement;
window.startWork = startWork;
window.deliverService = deliverService;
window.openRejectModal = openRejectModal;
window.closeRejectModal = closeRejectModal;
window.submitReject = submitReject;

// ==========================================
//  إدارة الخدمات وإضافتها
// ==========================================
async function loadServices() {
    const listContainer = document.getElementById('provider-services-list');

    try {
        const { data, error } = await _supabase
            .from('services')
            .select('*')
            .eq('provider_id', providerUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        providerServices = data || [];

        if (providerServices.length === 0) {
            listContainer.innerHTML = `
                <div class="col-span-full bg-white p-8 rounded-2xl border border-gray-100 text-center text-gray-400 font-bold">
                    📦 لا توجد لديك أي خدمات حالياً. اضغط على "+ إضافة خدمة جديدة" لرفع خدمتك الأولى للمراجعة.
                </div>
            `;
            return;
        }

        listContainer.innerHTML = '';
        providerServices.forEach(srv => {
            // شارة الموافقة
            let approvalBadge = '';
            if (srv.is_approved === true) {
                approvalBadge = `<span class="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded">معتمد ونشط</span>`;
            } else if (srv.is_approved === false) {
                approvalBadge = `<span class="bg-amber-50 text-amber-705 border border-amber-100 text-[10px] font-bold px-2 py-0.5 rounded animate-pulse">قيد مراجعة الإدارة</span>`;
            } else {
                approvalBadge = `<span class="bg-red-50 text-red-655 border border-red-100 text-[10px] font-bold px-2 py-0.5 rounded">مرفوض من المنصة</span>`;
            }

            const card = document.createElement('div');
            card.className = "bg-white rounded-3xl p-5 border border-gray-150 shadow-sm flex flex-col justify-between space-y-4";
            card.innerHTML = `
                <div class="space-y-3">
                    <div class="flex justify-between items-start">
                        <div class="w-12 h-12 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-3xl select-none">
                            ${srv.logo_url || '📦'}
                        </div>
                        <div class="flex flex-col items-end gap-1">
                            <span class="text-purple-700 text-xs font-black bg-purple-50 border border-purple-100 px-2.5 py-0.5 rounded-lg">$${parseFloat(srv.price_usd).toFixed(2)}</span>
                            ${approvalBadge}
                        </div>
                    </div>
                    <div>
                        <span class="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">${srv.category}</span>
                        <h4 class="text-sm font-bold text-gray-800 mt-1">${srv.title}</h4>
                        <p class="text-[11px] text-gray-400 font-semibold mt-1 leading-normal">${srv.description}</p>
                    </div>
                </div>
            `;
            listContainer.appendChild(card);
        });

    } catch (e) {
        console.error("Error loading provider services:", e);
    }
}

function openAddServiceModal() {
    document.getElementById('service-form').reset();
    document.getElementById('service-modal').classList.remove('hidden');
}

function closeServiceModal() {
    document.getElementById('service-modal').classList.add('hidden');
}

async function submitAddService(e) {
    e.preventDefault();
    const title = document.getElementById('service-title').value.trim();
    const description = document.getElementById('service-description').value.trim();
    const category = document.getElementById('service-category').value.trim();
    const price = parseFloat(document.getElementById('service-price').value || 0);
    const logo = document.getElementById('service-logo').value.trim();
    const duration = parseInt(document.getElementById('service-duration').value) || 3;

    const submitBtn = document.getElementById('service-submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerText = "⏳ جاري الإرسال...";

    try {
        const { error } = await _supabase
            .from('services')
            .insert([{
                title,
                description,
                category,
                price_usd: price,
                logo_url: logo,
                provider_id: providerUser.id,
                duration_days: duration,
                is_approved: false, // بانتظار مراجعة الأدمن
                status: 'متوفر'
            }]);

        if (error) throw error;

        showToast("تم إرسال الخدمة بنجاح! سيتم إظهارها للزبائن فور مراجعة وقبول الأدمن لها.", "success");
        closeServiceModal();
        loadServices();

        sendTelegramNotification(`الخدماتي ${providerUser.name} عمل خدمة جديدة (${title}) ادخل لقبولها`);

    } catch (e) {
        console.error(e);
        showToast("حدث خطأ أثناء إضافة الخدمة.", "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "إرسال للمراجعة";
    }
}

window.openAddServiceModal = openAddServiceModal;
window.closeServiceModal = closeServiceModal;
window.submitAddService = submitAddService;

// ==========================================
//  محفظة الأرباح وسحب الأموال
// ==========================================
function calcPayoutDzd() {
    const usd = parseFloat(document.getElementById('payout-amount-usd').value || 0);
    const rate = 220; // سعر الصرف الثابت لسحب مقدم الخدمة
    const dzd = Math.round(usd * rate);
    document.getElementById('payout-dzd-preview').innerText = `${dzd.toLocaleString('fr-FR')} دج`;
}

async function submitPayoutRequest(e) {
    e.preventDefault();
    const usd = parseFloat(document.getElementById('payout-amount-usd').value);
    const method = document.getElementById('payout-method').value;
    const details = document.getElementById('payout-details').value.trim();

    if (isNaN(usd) || usd <= 0) {
        showToast("يرجى كتابة مبلغ سحب صحيح.", "error");
        return;
    }

    if (usd > walletData.payout_balance_usd) {
        showToast(`عذراً، رصيدك القابل للسحب حالياً ($${parseFloat(walletData.payout_balance_usd).toFixed(2)}) أقل من المبلغ المطلوب.`, "error");
        return;
    }

    const confirmReq = confirm(`هل أنت متأكد من تقديم طلب سحب مبلغ ($${usd}) عبر ${method}؟\nسيتم حجز القيمة ومراجعتها من طرف الأدمن لتحويلها لحسابك.`);
    if (!confirmReq) return;

    const submitBtn = document.getElementById('payout-submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerText = "⏳ جاري إرسال طلب السحب...";

    try {
        const rate = 220;
        const dzd = Math.round(usd * rate);

        // 1. إرسال الطلب لجدول السحب
        const { error: insErr } = await _supabase
            .from('provider_payout_requests')
            .insert([{
                provider_id: providerUser.id,
                amount_usd: usd,
                amount_dzd: dzd,
                payout_method: method,
                payout_details: details,
                status: 'pending'
            }]);

        if (insErr) throw insErr;

        showToast("تم إرسال طلب السحب بنجاح! سيتم تحويل المبلغ قريباً وموافاتك بالتحديثات.", "success");
        document.getElementById('payout-form').reset();
        document.getElementById('payout-dzd-preview').innerText = '0 دج';
        
        loadWalletStats();
        loadPayoutHistory();

        sendTelegramNotification(`💰 طلب سحب أرباح جديد معلق من الشريك (${providerUser.name}):\n💵 المبلغ: $${usd} (${dzd.toLocaleString('fr-FR')} دج)\n🏦 وسيلة الدفع: ${method}`);

    } catch (err) {
        console.error(err);
        showToast("حدث خطأ أثناء معالجة طلب السحب.", "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "📥 تقديم طلب السحب";
    }
}

async function loadPayoutHistory() {
    const tbody = document.getElementById('payout-requests-history');

    try {
        const { data, error } = await _supabase
            .from('provider_payout_requests')
            .select('*')
            .eq('provider_id', providerUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="p-4 text-center text-gray-400">لا توجد أي طلبات سحب أرباح سابقة.</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = '';
        data.forEach(p => {
            const dateStr = new Date(p.created_at).toLocaleDateString('ar-DZ', { day: 'numeric', month: 'short' });
            
            let statusBadge = '';
            if (p.status === 'pending') {
                statusBadge = `<span class="bg-amber-50 text-amber-705 border border-amber-100 px-2 py-0.5 rounded">معلق</span>`;
            } else if (p.status === 'approved') {
                statusBadge = `<span class="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded">تم التحويل ✅</span>`;
            } else {
                statusBadge = `<span class="bg-red-50 text-red-655 border border-red-100 px-2 py-0.5 rounded">مرفوض ❌</span>`;
            }

            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-50/50 transition border-b border-slate-50';
            row.innerHTML = `
                <td class="p-3 text-gray-500">${dateStr}</td>
                <td class="p-3 font-bold text-gray-700">$${parseFloat(p.amount_usd).toFixed(2)}</td>
                <td class="p-3 font-bold text-indigo-700">${parseFloat(p.amount_dzd).toLocaleString('fr-FR')} دج</td>
                <td class="p-3 text-gray-600 font-semibold">${p.payout_method}</td>
                <td class="p-3 text-center">${statusBadge}</td>
                <td class="p-3 text-gray-400 truncate max-w-xs">${p.admin_notes || '-'}</td>
            `;
            tbody.appendChild(row);
        });

    } catch (e) {
        console.error(e);
    }
}

window.calcPayoutDzd = calcPayoutDzd;
window.submitPayoutRequest = submitPayoutRequest;

// ==========================================
//  تنبيهات تليجرام والمغادرة وتوست التنبيه
// ==========================================
async function sendTelegramNotification(text, targetChatId = null) {
    try {
        await _supabase.rpc('secure_send_telegram', {
            p_message: text,
            p_chat_id: targetChatId
        });
    } catch (e) {
        console.error("Telegram alert failed via RPC:", e);
    }
}

function handleLogout() {
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
}

window.handleLogout = handleLogout;

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
    
    setTimeout(() => {
        toast.classList.remove('translate-x-80', 'opacity-0');
    }, 50);

    setTimeout(() => {
        toast.classList.add('translate-x-80', 'opacity-0');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 300);
    }, 4500);
}

// ==========================================
//  نظام ربط التليجرام لمقدم الخدمة الشريك
// ==========================================
let telegramPollingInterval = null;

async function checkTelegramStatus() {
    const input = document.getElementById('telegram-chat-id-input');
    if (!input) return;

    try {
        const { data, error } = await _supabase
            .from('clients')
            .select('telegram_chat_id')
            .eq('id', providerUser.id)
            .single();

        if (error) throw error;
        if (data && data.telegram_chat_id) {
            input.value = data.telegram_chat_id;
            providerUser.telegram_chat_id = data.telegram_chat_id;
            localStorage.setItem('currentUser', JSON.stringify(providerUser));
        }
    } catch (e) {
        console.error("Error checking telegram status:", e);
    }
}

async function saveTelegramChatId() {
    const input = document.getElementById('telegram-chat-id-input');
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
            .eq('id', providerUser.id);

        if (error) throw error;

        providerUser.telegram_chat_id = chatId;
        localStorage.setItem('currentUser', JSON.stringify(providerUser));

        // إرسال تنبيه تجريبي عبر البوت
        try {
            await _supabase.rpc('secure_send_telegram', {
                p_message: "🎉 تم ربط حسابك بنجاح في AdVault! ستصلك إشعارات وتفاصيل العمل هنا فوراً.",
                p_chat_id: chatId
            });
        } catch (_) {}

        showToast("تم حفظ معرف التليجرام وإرسال رسالة تأكيد بنجاح! 🏆", "success");
    } catch (e) {
        console.error("Error saving telegram chat ID:", e);
        showToast("حدث خطأ أثناء حفظ معرف التليجرام.", "error");
    }
}

function openChatFromProvider(reqId) {
    localStorage.setItem('active_chat_request_id', reqId);
    window.location.href = 'inbox.html';
}

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

async function changeProviderPassword(event) {
    if (event) event.preventDefault();
    const newPassInput = document.getElementById('provider-new-pass');
    const newPass = newPassInput.value.trim();

    if (!newPass || newPass.length < 4) {
        alert("يرجى كتابة كلمة مرور قوية مكونة من 4 أحرف أو أكثر.");
        return;
    }

    try {
        const hashed = await hashPassword(newPass);

        const { error } = await _supabase
            .from('clients')
            .update({ password: hashed })
            .eq('id', providerUser.id);

        if (error) throw error;

        // تحديث محلي للجلسة
        providerUser.password = hashed;
        localStorage.setItem('currentUser', JSON.stringify(providerUser));

        alert("تم تحديث كلمة المرور بنجاح! 🔒");
        newPassInput.value = '';

    } catch (e) {
        console.error("Error changing provider password:", e);
        alert("حدث خطأ أثناء تحديث كلمة المرور.");
    }
}

async function loadProviderRedotPaySettings() {
    const input = document.getElementById('provider-redotpay-id');
    if (!input || !providerUser) return;
    try {
        const { data, error } = await _supabase
            .from('clients')
            .select('redotpay_id')
            .eq('id', providerUser.id)
            .maybeSingle();

        if (error) throw error;
        if (data && data.redotpay_id) {
            input.value = data.redotpay_id;
        }
    } catch (e) {
        console.error("Error loading provider RedotPay setting:", e);
    }
}

async function saveProviderRedotPay(event) {
    if (event) event.preventDefault();
    const input = document.getElementById('provider-redotpay-id');
    const redotpayId = input.value.trim();

    if (!redotpayId) {
        alert("يرجى كتابة معرف صحيح.");
        return;
    }

    try {
        const { error } = await _supabase
            .from('clients')
            .update({ redotpay_id: redotpayId })
            .eq('id', providerUser.id);

        if (error) throw error;

        providerUser.redotpay_id = redotpayId;
        localStorage.setItem('currentUser', JSON.stringify(providerUser));

        alert("تم حفظ معرف RedotPay بنجاح! 💳");
    } catch (e) {
        console.error("Error saving RedotPay ID:", e);
        alert("حدث خطأ أثناء حفظ المعرف.");
    }
}

window.checkTelegramStatus = checkTelegramStatus;
window.saveTelegramChatId = saveTelegramChatId;
window.openChatFromProvider = openChatFromProvider;
window.changeProviderPassword = changeProviderPassword;
window.loadProviderRedotPaySettings = loadProviderRedotPaySettings;
window.saveProviderRedotPay = saveProviderRedotPay;
window.openDeliverWorkModal = openDeliverWorkModal;
window.closeDeliverWorkModal = closeDeliverWorkModal;
window.submitWorkDelivery = submitWorkDelivery;

// ==========================================
//  رسم المخططات البيانية لإحصائيات أداء الشريك
// ==========================================
let statusChartInstance = null;
let revenueChartInstance = null;

window.updateProviderCharts = function(allReqs) {
    const statusCtx = document.getElementById('provider-status-chart')?.getContext('2d');
    const revenueCtx = document.getElementById('provider-revenue-chart')?.getContext('2d');
    if (!statusCtx || !revenueCtx) return;

    // 1. حساب أعداد الطلبات حسب حالتها
    const counts = {
        'completed': 0,
        'active': 0,
        'rejected': 0,
        'disputed': 0
    };

    allReqs.forEach(r => {
        if (r.status === 'completed') {
            counts.completed++;
        } else if (r.status === 'rejected') {
            counts.rejected++;
        } else if (r.status === 'disputed') {
            counts.disputed++;
        } else {
            counts.active++; // pending, agreement, in_progress, delivered
        }
    });

    // رسم الدونات لتوزيع الحالات
    if (statusChartInstance) statusChartInstance.destroy();
    statusChartInstance = new Chart(statusCtx, {
        type: 'doughnut',
        data: {
            labels: ['مكتملة ✅', 'نشطة ⏳', 'مرفوضة ❌', 'نزاعات ⚠️'],
            datasets: [{
                data: [counts.completed, counts.active, counts.rejected, counts.disputed],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(59, 130, 246, 0.7)',
                    'rgba(239, 68, 68, 0.7)',
                    'rgba(245, 158, 11, 0.7)'
                ],
                borderColor: [
                    'rgb(16, 185, 129)',
                    'rgb(59, 130, 246)',
                    'rgb(239, 68, 68)',
                    'rgb(245, 158, 11)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { boxWidth: 10, font: { size: 10 } }
                }
            }
        }
    });

    // 2. حساب الأرباح التراكمية عبر الزمن للطلبات المكتملة
    const completedReqs = allReqs
        .filter(r => r.status === 'completed' && r.created_at)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const labels = [];
    const revenueData = [];
    let cumulativeSum = 0;

    const dailyTotals = {};
    completedReqs.forEach(r => {
        const dateStr = new Date(r.created_at).toLocaleDateString('ar-DZ', { month: 'short', day: 'numeric' });
        dailyTotals[dateStr] = (dailyTotals[dateStr] || 0) + parseFloat(r.price_usd || 0);
    });

    Object.keys(dailyTotals).forEach(date => {
        cumulativeSum += dailyTotals[date];
        labels.push(date);
        revenueData.push(cumulativeSum);
    });

    if (labels.length === 0) {
        labels.push("لا توجد أرباح بعد");
        revenueData.push(0);
    }

    if (revenueChartInstance) revenueChartInstance.destroy();
    revenueChartInstance = new Chart(revenueCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'تراكمي الأرباح ($)',
                data: revenueData,
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderColor: 'rgb(99, 102, 241)',
                borderWidth: 2,
                pointBackgroundColor: 'rgb(99, 102, 241)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { font: { size: 9 } }
                },
                x: {
                    ticks: { font: { size: 9 } }
                }
            }
        }
    });
};
