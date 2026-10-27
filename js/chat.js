// ==========================================
//  إعدادات Supabase والتحقق من الجلسة
// ==========================================
const SUPABASE_URL = "https://uljdazwcjxogpymvbflq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DGoBEde67ewtWtMlC4Nx9w_cuvSAmUc";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const currentUser = JSON.parse(localStorage.getItem('currentUser'));
if (!currentUser) {
    window.location.href = 'index.html';
}

// ثوابت الملاحة والحالة
let activeRequestId = null;
let activeRecipientId = null;
let activeRecipientUser = null;
let activeRequestData = null;
let pollingInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. تحديث شارة الرتبة والترحيب
    const roleBadge = document.getElementById('chat-user-role-badge');
    if (currentUser.role === 'provider') {
        roleBadge.innerText = "بوابة مقدم الخدمات • حساب شريك";
    } else {
        roleBadge.innerText = "بوابة العميل • حساب زبون";
        // إخفاء القائمة الجانبية في الهاتف والحاسوب للزبون لأن لديه محادثة واحدة مباشرة لكل خدمة
        document.getElementById('chat-sidebar').classList.add('hidden');
    }

    // 2. فحص نوع الملاحة والمحاذاة
    const localReqId = localStorage.getItem('active_chat_request_id');
    localStorage.removeItem('active_chat_request_id'); // مسح معرف الشات المؤقت لمنع تكراره
    
    const urlParams = new URLSearchParams(window.location.search);
    const reqIdParam = urlParams.get('request_id') || localReqId;

    if (currentUser.role === 'provider') {
        // مقدم الخدمات يرى القائمة الجانبية ويحمل المحادثات
        document.getElementById('chat-sidebar').classList.remove('hidden');
        await loadProviderChannels();
        
        if (reqIdParam) {
            await selectRequestChannel(reqIdParam);
        }
    } else {
        // الزبون يوجه مباشرة للمحادثة المحددة بالـ request_id
        if (!reqIdParam) {
            alert("عذراً، يجب فتح المحادثة من خلال طلب خدمة محدد.");
            goBackToDashboard();
            return;
        }
        await loadClientChannel(reqIdParam);
    }

    if (urlParams.get('new_request') === 'true') {
        showNewRequestAlert();
    }
});

// العودة للوحة التحكم المناسبة
function goBackToDashboard() {
    if (currentUser.role === 'provider') {
        window.location.href = 'provider.html';
    } else if (currentUser.role === 'admin') {
        window.location.href = 'admin.html';
    } else {
        window.location.href = 'client.html';
    }
}

// ==========================================
//  قنوات محادثات مقدمي الخدمات (شريك)
// ==========================================
async function loadProviderChannels() {
    const listContainer = document.getElementById('chat-channels-list');
    listContainer.innerHTML = '<div class="p-6 text-center text-slate-400 font-bold text-xs">⏳ جاري تحميل المحادثات...</div>';

    try {
        // جلب كل الطلبات المرتبطة بهذا الشريك
        const { data: requests, error } = await _supabase
            .from('service_requests')
            .select('*')
            .eq('provider_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!requests || requests.length === 0) {
            listContainer.innerHTML = '<div class="p-6 text-center text-slate-400 font-bold text-xs">لا توجد أي محادثات نشطة مع الزبائن حالياً.</div>';
            return;
        }

        listContainer.innerHTML = '';
        requests.forEach(r => {
            const activeClass = r.id === activeRequestId ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-slate-50 border-transparent';
            const item = document.createElement('div');
            item.className = `p-4 border-r-4 transition cursor-pointer flex justify-between items-center ${activeClass}`;
            item.onclick = () => selectRequestChannel(r.id);
            item.innerHTML = `
                <div>
                    <h4 class="font-bold text-slate-700 text-xs">${r.client_name}</h4>
                    <p class="text-[10px] text-slate-400 font-semibold mt-1">${r.service_title}</p>
                </div>
                <span class="text-xs bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded">${translateStatus(r.status)}</span>
            `;
            listContainer.appendChild(item);
        });

    } catch (e) {
        console.error("Error loading channels:", e);
        listContainer.innerHTML = '<div class="p-6 text-center text-red-500 font-bold text-xs">حدث خطأ أثناء تحميل المحادثات.</div>';
    }
}

function translateStatus(status) {
    const mappings = {
        'pending': 'معلق',
        'agreement': 'تفاهم',
        'in_progress': 'قيد العمل',
        'delivered': 'تم التسليم',
        'completed': 'مكتمل',
        'disputed': 'نزاع'
    };
    return mappings[status] || status;
}

// اختيار محادثة لمقدم الخدمة
async function selectRequestChannel(reqId) {
    activeRequestId = reqId;
    
    // إعادة تحميل قائمة القنوات لتحديث التحديد البصري
    await loadProviderChannels();

    try {
        // جلب تفاصيل الطلب
        const { data: req, error } = await _supabase
            .from('service_requests')
            .select('*')
            .eq('id', reqId)
            .single();

        if (error) throw error;

        activeRequestData = req;
        activeRecipientId = req.client_id;

        // جلب هاتف ومعلومات الزبون
        const { data: clientUser } = await _supabase
            .from('clients')
            .select('name, phone, telegram_chat_id')
            .eq('id', activeRecipientId)
            .single();

        activeRecipientUser = clientUser;

        // تحديث الهيدر
        document.getElementById('active-chat-partner-name').innerText = clientUser?.name || req.client_name;
        document.getElementById('active-chat-service-title').innerText = req.service_title;
        document.getElementById('active-user-avatar').innerText = (clientUser?.name || 'ز')[0];

        // تحديث شارة تليجرام المستقبل
        const telegramBadge = document.getElementById('partner-telegram-badge');
        telegramBadge.classList.remove('hidden');
        if (clientUser?.telegram_chat_id) {
            telegramBadge.innerText = "تليجرام: مربوط ✅";
            telegramBadge.className = "text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100";
        } else {
            telegramBadge.innerText = "تليجرام: غير مربوط ❌";
            telegramBadge.className = "text-[9px] font-bold px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-100";
        }

        // إظهار صندوق الإدخال
        document.getElementById('chat-input-form').classList.remove('hidden');

        // تحميل الرسائل وبدء الفحص الدوري
        loadMessages();
        startMessagesPolling();

    } catch (e) {
        console.error(e);
        alert("فشل تحميل تفاصيل المحادثة.");
    }
}

// ==========================================
//  قناة محادثة العميل (الزبون)
// ==========================================
async function loadClientChannel(reqId) {
    activeRequestId = reqId;

    try {
        // 1. جلب بيانات طلب الخدمة
        const { data: req, error } = await _supabase
            .from('service_requests')
            .select('*')
            .eq('id', reqId)
            .single();

        if (error) throw error;

        activeRequestData = req;

        // 2. التحقق من وجود شريك مقدم خدمة للطلب
        if (!req.provider_id) {
            document.getElementById('chat-messages-box').innerHTML = `
                <div class="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
                    <span class="text-4xl">🤖</span>
                    <p class="font-bold text-xs">هذا الطلب تملكه المنصة مباشرة ولا يوجد شريك مستقل للمحادثة معه.</p>
                    <p class="text-[10px] text-slate-400 font-semibold">يمكنك التواصل مع الدعم الفني العام مباشرة عبر الواتساب.</p>
                </div>
            `;
            return;
        }

        activeRecipientId = req.provider_id;

        // 3. جلب بيانات مقدم الخدمة (الاسم، هاتف، ومعرف التليجرام)
        const { data: provider } = await _supabase
            .from('clients')
            .select('name, phone, telegram_chat_id')
            .eq('id', activeRecipientId)
            .single();

        activeRecipientUser = provider;

        // تحديث الهيدر
        document.getElementById('active-chat-partner-name').innerText = provider?.name || "مقدم الخدمة الشريك";
        document.getElementById('active-chat-service-title').innerText = req.service_title;
        document.getElementById('active-user-avatar').innerText = (provider?.name || 'م')[0];

        // تحديث شارة تليجرام المستقبل
        const telegramBadge = document.getElementById('partner-telegram-badge');
        telegramBadge.classList.remove('hidden');
        if (provider?.telegram_chat_id) {
            telegramBadge.innerText = "تليجرام: مربوط ✅";
            telegramBadge.className = "text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100";
        } else {
            telegramBadge.innerText = "تليجرام: غير مربوط ❌";
            telegramBadge.className = "text-[9px] font-bold px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-100";
        }

        // إظهار صندوق الإدخال
        document.getElementById('chat-input-form').classList.remove('hidden');

        // تحميل الرسائل وبدء الفحص الدوري
        loadMessages();
        startMessagesPolling();

    } catch (e) {
        console.error(e);
        document.getElementById('chat-messages-box').innerHTML = '<div class="p-6 text-center text-red-500 font-bold text-xs">حدث خطأ أثناء تحميل الشات.</div>';
    }
}

// ==========================================
//  تحميل وعرض الرسائل (Live Load)
// ==========================================
async function loadMessages() {
    if (!activeRequestId) return;
    const box = document.getElementById('chat-messages-box');

    try {
        const { data: messages, error } = await _supabase
            .from('chat_messages')
            .select('*')
            .eq('request_id', activeRequestId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        const list = messages || [];
        if (list.length === 0) {
            box.innerHTML = `
                <div class="h-full flex flex-col items-center justify-center text-slate-400 space-y-1">
                    <span class="text-3xl">🤝</span>
                    <p class="font-bold text-xs">مرحباً بك! لا توجد رسائل سابقة هنا بعد.</p>
                    <p class="text-[9px] text-slate-400">ابدأ بإرسال أول رسالة لبدء التفاهم والمتابعة الفورية.</p>
                </div>
            `;
            return;
        }

        const isAtBottom = box.scrollHeight - box.clientHeight <= box.scrollTop + 100;

        box.innerHTML = '';
        list.forEach(m => {
            const isMe = m.sender_id === currentUser.id;
            
            const outerDiv = document.createElement('div');
            outerDiv.className = `flex ${isMe ? 'justify-start' : 'justify-end'} w-full`;

            const timeStr = new Date(m.created_at).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' });

            let contentHtml = `<p>${m.message_text}</p>`;

            if (m.message_text && m.message_text.startsWith('[FILE:')) {
                const closeBracketIndex = m.message_text.indexOf(']');
                if (closeBracketIndex !== -1) {
                    const fileUrl = m.message_text.substring(6, closeBracketIndex);
                    const fileName = m.message_text.substring(closeBracketIndex + 1);
                    const fileExt = fileName.split('.').pop().toLowerCase();

                    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExt);
                    const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(fileExt);

                    if (isImage) {
                        contentHtml = `
                            <div class="space-y-2">
                                <a href="${fileUrl}" target="_blank">
                                    <img src="${fileUrl}" alt="Attachment" class="max-w-xs rounded-xl shadow-sm border border-gray-150 hover:scale-[1.02] transition duration-200">
                                </a>
                                <p class="text-[10px] text-slate-500 font-bold mt-1">${fileName}</p>
                            </div>
                        `;
                    } else if (isVideo) {
                        contentHtml = `
                            <div class="space-y-2">
                                <video src="${fileUrl}" controls class="max-w-xs rounded-xl shadow-sm border border-gray-150"></video>
                                <p class="text-[10px] text-slate-500 font-bold mt-1">${fileName}</p>
                            </div>
                        `;
                    } else {
                        // Document / ZIP attachment card
                        contentHtml = `
                            <div class="flex items-center gap-3 bg-slate-50 border border-slate-150 p-3 rounded-2xl max-w-xs">
                                <span class="text-3xl">📁</span>
                                <div class="flex-1 min-w-0">
                                    <p class="font-bold text-slate-800 text-[11px] truncate" title="${fileName}">${fileName}</p>
                                    <a href="${fileUrl}" target="_blank" download="${fileName}" class="inline-block mt-1 text-[10px] text-indigo-650 hover:text-indigo-800 font-black">
                                        ⬇️ تحميل الملف المرفق
                                    </a>
                                </div>
                            </div>
                        `;
                    }
                }
            }

            outerDiv.innerHTML = `
                <div class="max-w-[75%] p-3.5 shadow-sm text-xs font-semibold leading-relaxed ${isMe ? 'chat-bubble-sender' : 'chat-bubble-recipient'}">
                    ${contentHtml}
                    <span class="block text-[8px] text-right mt-1.5 opacity-60 font-mono">${timeStr}</span>
                </div>
            `;
            box.appendChild(outerDiv);
        });

        // النزول التلقائي لأسفل الصندوق عند وجود رسائل جديدة
        if (isAtBottom) {
            box.scrollTop = box.scrollHeight;
        }

    } catch (e) {
        console.error("Error loading messages:", e);
    }
}

// بدء الفحص الدوري (كل 3 ثوانٍ)
function startMessagesPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(loadMessages, 3000);
}

// ==========================================
//  إرسال الرسائل وتوجيه الإشعارات الذكي
// ==========================================
let selectedFile = null;

function triggerFileInput() {
    document.getElementById('chat-file-input').click();
}

function handleFileSelection(event) {
    const file = event.target.files[0];
    if (!file) return;

    const limitBytes = 50 * 1024 * 1024;
    if (file.size > limitBytes) {
        alert("⚠️ عذراً، الحجم الأقصى للملفات المسموح بها هو 50 ميجابايت.");
        cancelSelectedFile();
        return;
    }

    selectedFile = file;

    const previewBar = document.getElementById('chat-file-preview-bar');
    const nameLabel = document.getElementById('preview-file-name');
    const sizeLabel = document.getElementById('preview-file-size');

    if (previewBar && nameLabel && sizeLabel) {
        nameLabel.innerText = file.name;
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        sizeLabel.innerText = `(${sizeMb} MB)`;
        previewBar.classList.remove('hidden');
    }
}

function cancelSelectedFile() {
    selectedFile = null;
    document.getElementById('chat-file-input').value = '';
    const previewBar = document.getElementById('chat-file-preview-bar');
    if (previewBar) {
        previewBar.classList.add('hidden');
    }
}

async function sendMessage(event) {
    if (event) event.preventDefault();
    const input = document.getElementById('chat-message-text');
    let text = input.value.trim();
    
    if (!text && !selectedFile) return;
    if (!activeRequestId || !activeRecipientId) return;

    input.value = '';

    try {
        let finalMessageText = text;

        if (selectedFile) {
            input.disabled = true;
            input.placeholder = "⏳ جاري رفع الملف، يرجى الانتظار...";

            const fileExt = selectedFile.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `chat/${activeRequestId}/${fileName}`;

            const { data: uploadData, error: uploadErr } = await _supabase.storage
                .from('vault-attachments')
                .upload(filePath, selectedFile);

            if (uploadErr) throw uploadErr;

            const { data: urlData } = _supabase.storage
                .from('vault-attachments')
                .getPublicUrl(filePath);

            const publicUrl = urlData.publicUrl;
            finalMessageText = `[FILE:${publicUrl}]${selectedFile.name}`;
            
            cancelSelectedFile();
        }

        const { error } = await _supabase
            .from('chat_messages')
            .insert([{
                request_id: activeRequestId,
                sender_id: currentUser.id,
                recipient_id: activeRecipientId,
                message_text: finalMessageText
            }]);

        if (error) throw error;

        await loadMessages();
        
        const box = document.getElementById('chat-messages-box');
        box.scrollTop = box.scrollHeight;

        await routeTelegramNotification(finalMessageText);

    } catch (e) {
        console.error(e);
        alert("فشل إرسال الرسالة.");
    } finally {
        input.disabled = false;
        input.placeholder = "اكتب رسالتك هنا...";
    }
}

async function routeTelegramNotification(messageText) {
    const senderName = currentUser.name || "عضو المنصة";
    const serviceTitle = activeRequestData?.service_title || "خدمة مخصصة";

    if (activeRecipientUser && activeRecipientUser.telegram_chat_id) {
        const BOT_TOKEN_PROV = "8636070898:AAFA5OZwJ81WqVvC9TfaudmOjLKV4r43tcM";
        const notificationText = `💬 رسالة جديدة من ${senderName} حول خدمة (${serviceTitle}):\n"${messageText.startsWith('[FILE:') ? '📎 [ملف مرفق]' : messageText}"\n\nيرجى الدخول للموقع للمتابعة والرد الفوري.`;
        
        const url = `https://api.telegram.org/bot${BOT_TOKEN_PROV}/sendMessage?chat_id=${activeRecipientUser.telegram_chat_id}&text=${encodeURIComponent(notificationText)}`;
        try {
            await fetch(url);
        } catch (e) {
            console.error("Direct provider notification failed:", e);
        }
    } else {
        const BOT_TOKEN_ADMIN = "8636070898:AAFA5OZwJ81WqVvC9TfaudmOjLKV4r43tcM";
        const CHAT_ID_ADMIN = "1746721547";
        
        const recipientName = activeRecipientUser?.name || "الطرف الآخر";
        const adminWarningText = `⚠️ تنبيه محادثة معلقة بالتليجرام!\n\nالمرسل: ${senderName}\nالمستقبل: ${recipientName} (لم يربط حسابه بالتليجرام ❌)\n\n💬 محتوى الرسالة:\n"${messageText.startsWith('[FILE:') ? '📎 [ملف مرفق]' : messageText}"\n\nيرجى التواصل معه أو تذكيره لربط معرف التليجرام الخاص به لتفعيل الإشعارات.`;
        
        const url = `https://api.telegram.org/bot${BOT_TOKEN_ADMIN}/sendMessage?chat_id=${CHAT_ID_ADMIN}&text=${encodeURIComponent(adminWarningText)}`;
        try {
            await fetch(url);
        } catch (e) {
            console.error("Admin warning notification failed:", e);
        }
    }
}

function showNewRequestAlert() {
    const alertDiv = document.createElement('div');
    alertDiv.id = 'new-request-alert-banner';
    alertDiv.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-emerald-600 to-indigo-600 text-white font-bold px-6 py-4 rounded-2xl shadow-2xl z-50 text-center text-xs border border-white/20 animate-bounce flex flex-col gap-1 items-center';
    alertDiv.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="text-sm">🎉</span>
            <span>تم طلب الخدمة بنجاح!</span>
        </div>
        <div class="text-[10px] text-emerald-100 font-semibold mt-0.5">تواصل مع صاحب الخدمة الآن لمناقشة التفاصيل.</div>
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.style.transition = 'all 0.5s ease';
        alertDiv.style.opacity = '0';
        alertDiv.style.transform = 'translate(-50%, -20px)';
        setTimeout(() => {
            alertDiv.remove();
        }, 500);
    }, 4000);
}

// جعل الدوال متاحة
window.goBackToDashboard = goBackToDashboard;
window.selectRequestChannel = selectRequestChannel;
window.sendMessage = sendMessage;
window.triggerFileInput = triggerFileInput;
window.handleFileSelection = handleFileSelection;
window.cancelSelectedFile = cancelSelectedFile;
window.showNewRequestAlert = showNewRequestAlert;
