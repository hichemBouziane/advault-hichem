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

const REDOTPAY_ID = "1999499801";

// التحقق من تسجيل الدخول فوراً عند فتح السكريبت
const user = JSON.parse(localStorage.getItem('currentUser'));
if (!user || user.role !== 'client') {
    window.location.href = 'index.html';
}

// تهيئة الصفحة
document.addEventListener('DOMContentLoaded', () => {
    if (user && user.name) {
        document.getElementById('user-welcome').innerText = `بوابة الشحن — ${user.name}`;
    }

    // استرجاع المبالغ وحالة الحساب المحسوبة مسبقاً من localStorage
    const absDzd = parseInt(localStorage.getItem('recharge_absDzd')) || 0;
    const usdAmount = parseFloat(localStorage.getItem('recharge_usdAmount')) || 0.00;

    document.getElementById('modal-balance').innerHTML = `
        <span class="text-2xl font-bold text-red-600">${absDzd.toLocaleString('fr-FR')} دج</span>
        <span class="block text-sm font-semibold text-gray-400 mt-1">≈ ${usdAmount} $</span>
    `;
    document.getElementById('redotpay-id').innerText = REDOTPAY_ID;

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

function copyRedotpayId(event) {
    const id = document.getElementById('redotpay-id').innerText;
    navigator.clipboard.writeText(id).then(() => {
        const btn          = event ? event.target : document.querySelector('[onclick^="copyRedotpayId"]');
        const originalText = btn.innerText;
        btn.innerText      = '✅ تم النسخ!';
        setTimeout(() => { btn.innerText = originalText; }, 2000);
    });
}

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
        
        showToast("تم إرسال طلب الشحن بنجاح! سيتم مراجعة إثبات الدفع وتأكيده قريباً.", "success");
        amountUsdEl.value = '';
        screenshotEl.value = '';
        document.getElementById('deposit-dzd-preview').innerText = '0 دج';
        
        // العودة لصفحة العميل بعد ثانيتين
        setTimeout(() => {
            window.location.href = 'client.html';
        }, 2000);
        
    } catch (err) {
        console.error(err);
        showToast("فشل إرسال الطلب: " + err.message, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

async function sendTelegramNotification(text) {
    try {
        await _supabase.rpc('secure_send_telegram', {
            p_message: text,
            p_chat_id: '1746721547'
        });
    } catch (e) {
        console.error("Failed to send Telegram alert via RPC:", e);
    }
}

function showToast(message, type = 'success') {
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

    setTimeout(() => {
        toast.classList.remove('translate-x-80', 'opacity-0');
    }, 50);
    
    setTimeout(() => {
        toast.classList.add('translate-x-80', 'opacity-0');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4500);
}

async function requestAgentService() {
    const btn = document.getElementById('agent-contact-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = "⏳ جاري توجيهك للوكيل...";
    }

    try {
        const { data: services, error } = await _supabase
            .from('services')
            .select('*')
            .ilike('title', '%redotpay%')
            .eq('is_approved', true)
            .limit(1);

        let srv = null;
        if (!error && services && services.length > 0) {
            srv = services[0];
        }

        const serviceTitle = srv ? srv.title : "شحن رصيد redotpay";
        const serviceId = srv ? srv.id : null;
        const providerId = srv ? srv.provider_id : null;
        const priceUsd = srv ? parseFloat(srv.price_usd || 0) : 0;

        const { data: requestData, error: insertErr } = await _supabase
            .from('service_requests')
            .insert([{
                client_id: user.id,
                client_name: user.name || 'زبون تجاري',
                service_id: serviceId,
                service_title: serviceTitle,
                price_usd: priceUsd,
                provider_id: providerId,
                status: 'pending'
            }])
            .select()
            .single();

        if (insertErr) throw insertErr;

        if (requestData && requestData.id) {
            try {
                const recipientId = providerId || "1746721547";
                await _supabase
                    .from('chat_messages')
                    .insert([{
                        request_id: requestData.id,
                        sender_id: user.id,
                        recipient_id: recipientId,
                        message_text: "السلام عليكم"
                    }]);
            } catch (errChat) {
                console.error("Error inserting initial message:", errChat);
            }
        }

        const telegramMessage = `الزبون ${user.name || 'زبون تجاري'} طلب خدمة (${serviceTitle}) عبر لوحة الشحن للاتصال بالوكيل.`;
        await sendTelegramNotification(telegramMessage);

        if (providerId) {
            try {
                const { data: prov } = await _supabase
                    .from('clients')
                    .select('telegram_chat_id')
                    .eq('id', providerId)
                    .single();

                if (prov && prov.telegram_chat_id) {
                    const providerMsg = `الزبون ${user.name || 'زبون تجاري'} طلب خدمة (${serviceTitle}) عبر لوحة الشحن للاتصال بك.`;
                    const BOT_TOKEN_PROV = "8636070898:AAFA5OZwJ81WqVvC9TfaudmOjLKV4r43tcM";
                    const provUrl = `https://api.telegram.org/bot${BOT_TOKEN_PROV}/sendMessage?chat_id=${prov.telegram_chat_id}&text=${encodeURIComponent(providerMsg)}`;
                    await fetch(provUrl);
                }
            } catch (errProv) {
                console.error("Failed to notify provider on telegram:", errProv);
            }
        }

        showToast("تم فتح طلب خدمة وتوجيهك لدردشة الوكيل بنجاح!", "success");

        setTimeout(() => {
            if (requestData && requestData.id) {
                window.location.href = `inbox.html?request_id=${requestData.id}&new_request=true`;
            } else {
                window.location.href = 'client.html';
            }
        }, 1500);

    } catch (err) {
        console.error("Error requesting agent service:", err);
        showToast("فشل فتح طلب للتواصل مع الوكلاء.", "error");
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = "تواصل مع الوكلاء لشراء الدولار بالعاصمة";
        }
    }
}

window.requestAgentService = requestAgentService;
