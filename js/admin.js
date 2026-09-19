// ==========================================
//  إعدادات Supabase
// ==========================================
window.SUPABASE_URL = window.SUPABASE_URL || "https://uljdazwcjxogpymvbflq.supabase.co";
window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "sb_publishable_DGoBEde67ewtWtMlC4Nx9w_cuvSAmUc";

{
    const localUser = JSON.parse(localStorage.getItem('currentUser'));
    const headers = {};
    if (localUser && localUser.session_token) {
        headers['x-session-token'] = localUser.session_token;
    }
    window._supabase = window._supabase || supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
        global: { headers }
    });
}

// ==========================================
//  إعدادات Meta & Gemini
// ==========================================

window.GEMINI_API_KEY = window.GEMINI_API_KEY || "AQ.Ab8RN6KeOoitkHChvbjn6l25tyPeGwMxjuhRPlg-Bz789QLDFg";

// ==========================================
//  تهيئة الصفحة عند التحميل
// ==========================================
let user;

document.addEventListener('DOMContentLoaded', async () => {
    user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user || user.role !== 'admin') {
        window.location.href = 'login.html';
        return;
    }

    // التحقق الفوري من رتبة المستخدم في السيرفر لمنع تزوير جلسات الدخول
    try {
        const { data: isValid, error: roleErr } = await _supabase.rpc('verify_session_role', {
            p_user_id: user.id,
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

    document.getElementById('user-welcome').innerText = `مرحباً، ${user.name}`;
    loadAdminData();
    loadSummaryCards();
    fetchHeaderBalance(); // استدعاء دالة جلب الرصيد للهيدر
    checkPendingRequests(); // استدعاء دالة جلب عدد الطلبات المعلقة
    checkAdminTelegramStatus(); // فحص حالة ربط التليجرام للأدمن
    loadFbBillingSettings(); // تحميل إعدادات تنبيهات فوترة فيسبوك
    
    // مراقبة دورية للرصيد وتنبيهات الفوترة كل 10 دقائق أثناء فتح اللوحة
    setInterval(fetchHeaderBalance, 10 * 60 * 1000);
});

// ==========================================
//  Toast + Sound Notification
// ==========================================
function showToast(message) {
    // الصوت
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(880, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.1);
        g.gain.setValueAtTime(0.25, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        o.start(ctx.currentTime);
        o.stop(ctx.currentTime + 0.4);
    } catch(e) {}

    // الإشعار
    const toast = document.getElementById('toast-notification');
    document.getElementById('toast-msg-body').innerText = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
}

// ==========================================
//  جلب الرصيد العام من قوقل شيت وعرضه في الهيدر
// ==========================================
async function fetchHeaderBalance() {
    const BALANCE_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRHi9J9axOomtAw1vM9Y2VE_vHkOPwO77R2MDBiKKJfC3yXynHjBTaUzO1hFs3AEeZTmhEu9gBwHDDq/pub?gid=377665608&single=true&output=csv";
    try {
        const response = await fetch(BALANCE_SHEET_URL, { cache: "no-store" });
        if (!response.ok) throw new Error("فشل الاتصال بملف الرصيد");
        
        const rawText = await response.text();
        // استخراج السطر الأول وتقسيمه لجلب الخلية A1 و B1
        const firstLine = rawText.split('\n')[0];
        const columns = firstLine.split(',');
        let a1Value = columns[0] ? columns[0].replace(/["']/g, '').trim() : "0";
        let b1Value = columns[1] ? columns[1].replace(/["']/g, '').trim() : "292";
        
        // تحويل الفاصلة العادية إلى نقطة عشرية ليقرأها الجافاسكربت بشكل صحيح
        let normalizedValue = a1Value.replace(',', '.');
        const parsedValue = parseFloat(normalizedValue);

        // 1. تحديث قيمة الـ Spend الحالي (مكان الـ 0.00)
        const fbSpendEl = document.getElementById('fb-current-spend');
        if (fbSpendEl) {
            if (!isNaN(parsedValue)) {
                // عرض الرقم بالصيغة المحلية (يمكنك تغييرها إلى 'en-US' إذا كنت تفضل النقطة)
                fbSpendEl.innerText = parsedValue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } else {
                fbSpendEl.innerText = a1Value; // في حال فشل التحويل يعرض النص الخام
            }
        }

        // 2. تحديث شريط التقدم (Progress Bar) تلقائياً بناءً على العتبة المستخرجة من B1
        let normalizedThreshold = b1Value.replace(',', '.');
        const maxThreshold = parseFloat(normalizedThreshold) || 292;

        const fbMaxEl = document.getElementById('fb-max-spend');
        if (fbMaxEl) {
            fbMaxEl.innerText = maxThreshold.toLocaleString('fr-FR');
        }

        const progressBar = document.getElementById('fb-progress-bar');
        if (progressBar && !isNaN(parsedValue)) {
            // حساب النسبة المئوية بحيث لا تتخطى 100%
            let percentage = (parsedValue / maxThreshold) * 100;
            percentage = Math.min(Math.max(percentage, 0), 100); 
            
            // تحديث عرض الأنميشن للشريط
            progressBar.style.width = `${percentage}%`;

            // إزالة جميع الألوان السابقة لتفادي التداخل
            progressBar.classList.remove('bg-indigo-600', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-red-600');

            // تطبيق اللون الجديد حسب نسبة الخطورة
            if (percentage <= 25) {
                progressBar.classList.add('bg-emerald-500');
            } else if (percentage <= 50) {
                progressBar.classList.add('bg-purple-500');
            } else if (percentage <= 75) {
                progressBar.classList.add('bg-amber-500');
            } else {
                progressBar.classList.add('bg-red-600');
            }
        }

        // 3. تحديث عنصر الهيدر الرئيسي (إذا كنت ما زلت تستخدمه)
        const balanceEl = document.getElementById('header-balance');
        if (balanceEl) {
            balanceEl.innerText = isNaN(parsedValue) ? a1Value : `${parsedValue.toLocaleString('fr-FR')} $`;
        }

        // 4. فحص وإرسال تنبيهات فيسبوك التلقائية على تليجرام للأدمن (يوم الفوترة أو 90%)
        if (!isNaN(parsedValue)) {
            checkAndSendFacebookBillingAlerts(parsedValue, maxThreshold, (parsedValue / maxThreshold) * 100);
        }

    } catch (e) {
        console.error("❌ خطأ في جلب الرصيد وتحديث البيانات:", e.message);
        const fbSpendEl = document.getElementById('fb-current-spend');
        if (fbSpendEl) fbSpendEl.innerText = "خطأ!";
    }
}

// ==========================================
//  جلب بيانات الحملات من Google Sheets
// ==========================================
async function fetchMetaCampaignsSpend() {
    const CLEAN_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRHi9J9axOomtAw1vM9Y2VE_vHkOPwO77R2MDBiKKJfC3yXynHjBTaUzO1hFs3AEeZTmhEu9gBwHDDq/pub?gid=1473599105&single=true&output=csv";
    try {
        console.log("🔄 جاري بدء الاتصال بـ Google Sheets...");
        const response = await fetch(CLEAN_SHEET_URL, { cache: "no-store" });
        if (!response.ok) throw new Error("Network response was not ok");
        const rawText = await response.text();
        const lines = rawText.split('\n');
        const campaigns = [];
        for (let i = 1; i < lines.length; i++) {
            const currentLine = lines[i].trim();
            if (!currentLine) continue;
            const columns = currentLine.split(',');
            const campaignId = columns[0]?.replace(/["']/g, '').trim();
            const campaignName = columns[1]?.replace(/["']/g, '').trim();
            const spendValue = parseFloat(columns[2]?.replace(/["']/g, '').trim()) || 0;
            if (campaignId && campaignName) {
                campaigns.push({
                    id: campaignId,
                    name: campaignName,
                    insights: { data: [{ spend: spendValue }] }
                });
            }
        }
        console.log("✅ تم المعالجة بنجاح! عدد الحملات:", campaigns.length);
        return campaigns;
    } catch (e) {
        console.error("❌ خطأ أثناء معالجة قوقل شيت:", e.message);
        return [];
    }
}

// ==========================================
//  مزامنة الحملات من Google Sheets إلى Supabase
// ==========================================
async function syncCampaignsToSupabase(campaigns) {
    if (!campaigns || campaigns.length === 0) return;

    console.log("🔄 جاري مزامنة الحملات مع Supabase...");

    // بناء مصفوفة الحملات للرفع
    const upsertData = campaigns.map(camp => ({
        campaign_id: camp.id,
        campaign_name: camp.name,
        facebook_spend_euro: parseFloat(camp.insights?.data?.[0]?.spend || 0),
        updated_at: new Date().toISOString()
    }));

    // upsert: يحدّث إذا موجود، يضيف إذا جديد — بدون حذف أي شيء
    const { error } = await _supabase
        .from('facebook_campaigns')
        .upsert(upsertData, {
            onConflict: 'campaign_id',
            ignoreDuplicates: false
        });

    if (error) {
        console.error("❌ فشل المزامنة مع Supabase:", error.message);
    } else {
        console.log(`✅ تمت المزامنة بنجاح! ${upsertData.length} حملة محدّثة في Supabase.`);
    }
}

// ==========================================
//  جلب الحملات من Supabase (بديل سريع)
// ==========================================
async function getCampaignsFromSupabase() {
    const { data, error } = await _supabase
        .from('facebook_campaigns')
        .select('campaign_name, facebook_spend_euro');

    if (error || !data || data.length === 0) return null;

    // تحويل البيانات لنفس شكل fetchMetaCampaignsSpend
    return data.map(row => ({
        name: row.campaign_name,
        insights: { data: [{ spend: row.facebook_spend_euro }] }
    }));
}

// ==========================================
//  الدالة الرئيسية: جلب + مزامنة ذكية
// ==========================================
async function getAndSyncCampaigns() {
    // 1. العرض الفوري من قاعدة البيانات (للسرعة)
    const cached = await getCampaignsFromSupabase();

    // 2. التحديث في الخلفية من Google Sheets إلى Supabase
    fetchMetaCampaignsSpend().then(freshCampaigns => {
        if (freshCampaigns.length > 0) {
            syncCampaignsToSupabase(freshCampaigns);
        }
    }).catch(err => console.error("خطأ التحديث الخلفي:", err));

    // 3. إرجاع البيانات المخزنة فوراً
    return cached || [];
}

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

function calculateSpendForKeyword(campaigns, keyword) {
    if (!keyword) return 0;
    let totalSpend = 0;
    campaigns.forEach(camp => {
        if (isKeywordMatched(camp.name, keyword)) {
            if (camp.insights?.data?.[0]) totalSpend += parseFloat(camp.insights.data[0].spend || 0);
        }
    });
    return totalSpend;
}

// ==========================================
//  تحميل بيانات لوحة تحكم الأدمن
// ==========================================
async function loadAdminData() {
    const metaCampaigns = await getAndSyncCampaigns();
    let { data: clients } = await _supabase.from('clients').select('*').eq('role', 'client');
    const adminTable = document.getElementById('admin-clients-table');
    adminTable.innerHTML = '';
    if (!clients || clients.length === 0) {
        window.allClients = [];
        adminTable.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-400">لا يوجد زبائن حالياً.</td></tr>';
        return;
    }

    // جلب جميع الدفعات لتحديد أحدث تاريخ نشاط دفع لكل زبون بدقة
    const { data: allPayments } = await _supabase.from('payments').select('client_id, amount_euro, date, created_at');
    const paymentsByClient = {};
    if (allPayments) {
        allPayments.forEach(p => {
            if (!paymentsByClient[p.client_id]) {
                paymentsByClient[p.client_id] = [];
            }
            paymentsByClient[p.client_id].push(p);
        });
    }

    const processedClients = [];

    for (const client of clients) {
        let facebookSpendEuro = calculateSpendForKeyword(metaCampaigns, client.campaign_keyword);
        let clientPayments = paymentsByClient[client.id] || [];
        let totalPaidEuro = clientPayments.reduce((sum, item) => sum + parseFloat(item.amount_euro || 0), 0);
        let facebookSpendWithProfit = (parseFloat(facebookSpendEuro) || 0) * 1.2;
        let remainingEuro = facebookSpendWithProfit - (parseFloat(totalPaidEuro) || 0);
        let finalDebtDzd = Math.round(remainingEuro * (parseFloat(client.exchange_rate) || 240));

        // حساب تاريخ آخر نشاط دفع للزبون
        let latestPaymentTimestamp = 0;
        if (clientPayments.length > 0) {
            clientPayments.forEach(p => {
                const dateVal = p.date || p.created_at;
                if (dateVal) {
                    const t = new Date(dateVal).getTime();
                    if (!isNaN(t) && t > latestPaymentTimestamp) {
                        latestPaymentTimestamp = t;
                    }
                }
            });
        }

        let remainingUsdText = '';
        let remainingUsdClass = '';
        if (remainingEuro > 0) {
            remainingUsdText = `$ ${remainingEuro.toFixed(2)}`;
            remainingUsdClass = 'text-red-500 font-semibold';
        } else if (remainingEuro < 0) {
            remainingUsdText = `-$ ${Math.abs(remainingEuro).toFixed(2)}`;
            remainingUsdClass = 'text-gray-700 font-semibold';
        } else {
            remainingUsdText = '$ 0.00';
            remainingUsdClass = 'text-gray-500';
        }

        let remainingDaysText = '-';
        if (remainingEuro < 0) {
            const days = Math.abs(remainingEuro) / 6;
            remainingDaysText = `${days.toFixed(1)} يوم`;
        }

        processedClients.push({
            ...client,
            facebookSpendWithProfit,
            totalPaidEuro,
            remainingEuro,
            finalDebtDzd,
            remainingUsdText,
            remainingUsdClass,
            remainingDaysText,
            latestPaymentTimestamp
        });
    }

    // الترتيب: الزبون الأكثر نشاطاً (صاحب أحدث تاريخ دفع) هو الأول
    processedClients.sort((a, b) => {
        if (b.latestPaymentTimestamp !== a.latestPaymentTimestamp) {
            return b.latestPaymentTimestamp - a.latestPaymentTimestamp;
        }
        // في حال التساوي، الأحدث تسجيلاً أولاً
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    window.allClients = processedClients;

    const clientSpendNames = [];
    const clientSpendValues = [];

    for (const client of processedClients) {
        clientSpendNames.push(client.name || client.phone);
        clientSpendValues.push(parseFloat(client.facebookSpendWithProfit.toFixed(2)));

        let transferActionBtn = '<span class="text-gray-300 text-xs font-bold text-center block">-</span>';
        if (client.remainingEuro > 0.009) {
            transferActionBtn = `
                <button onclick="openTransferModal('${client.id}', 'debt')"
                    class="bg-red-50 hover:bg-red-100 text-red-650 border border-red-200/80 text-[11px] font-black px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 shadow-xs whitespace-nowrap mx-auto">
                    <span>🔄</span> نقل الدين
                </button>
            `;
        } else if (client.remainingEuro < -0.009) {
            transferActionBtn = `
                <button onclick="openTransferModal('${client.id}', 'surplus')"
                    class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 text-[11px] font-black px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 shadow-xs whitespace-nowrap mx-auto">
                    <span>💸</span> نقل الزيادة
                </button>
            `;
        }

        adminTable.innerHTML += `
            <tr class="hover:bg-gray-50 border-b border-gray-100">
                <td class="p-3 font-medium">
                    <button onclick="openClientPayments('${client.id}', '${client.name}')"
                        class="text-indigo-600 hover:text-indigo-800 hover:underline font-bold cursor-pointer transition">
                        ${client.name}
                    </button>
                </td>
                <td class="p-3 text-indigo-600 font-semibold">${client.campaign_keyword || '-'}</td>
                <td class="p-3 font-semibold">$ ${client.facebookSpendWithProfit.toFixed(2)}</td>
                <td class="p-3 text-emerald-600">${client.totalPaidEuro.toFixed(2)} $</td>
                <td class="p-3 text-gray-500">${client.exchange_rate} دج</td>
                <td class="p-3 font-bold ${client.finalDebtDzd > 0 ? 'text-red-500' : 'text-gray-700'}">${client.finalDebtDzd.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} دج</td>
                <td class="p-3 ${client.remainingUsdClass}">${client.remainingUsdText}</td>
                <td class="p-3 font-semibold text-purple-600">${client.remainingDaysText}</td>
                <td class="p-3 text-center">${transferActionBtn}</td>
            </tr>`;
    }

    await updateAdminCharts(clientSpendNames, clientSpendValues);
}

// ==========================================
//  إدارة نقل الديون والأرصدة الزائدة بين الزبائن
// ==========================================
let currentTransferSourceClient = null;

function openTransferModal(clientId, type) {
    const clients = window.allClients || [];
    const source = clients.find(c => c.id === clientId);
    if (!source) {
        showToast("تعذر العثور على بيانات الزبون المحدد.", "error");
        return;
    }

    currentTransferSourceClient = source;
    const modal = document.getElementById('transfer-balance-modal');
    const header = document.getElementById('transfer-modal-header');
    const title = document.getElementById('transfer-modal-title');
    const icon = document.getElementById('transfer-modal-icon');
    const confirmBtn = document.getElementById('transfer-confirm-btn');

    document.getElementById('transfer-source-id').value = source.id;
    document.getElementById('transfer-type').value = type;
    document.getElementById('transfer-source-name').innerText = source.name || source.phone || 'الزبون المحدد';

    const remainingEuro = parseFloat(source.remainingEuro || 0);
    const exchangeRate = parseFloat(source.exchange_rate || 240);
    const absUsd = Math.abs(remainingEuro);
    const absDzd = Math.round(absUsd * exchangeRate);

    document.getElementById('transfer-max-amount-usd').value = absUsd.toFixed(2);

    if (type === 'debt') {
        header.className = "p-5 text-white flex justify-between items-center bg-gradient-to-r from-red-600 to-rose-700";
        confirmBtn.className = "flex-1 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-black py-3 rounded-xl text-xs transition cursor-pointer shadow-lg shadow-red-600/20";
        title.innerText = `نقل ديون الشركة (${source.name})`;
        icon.innerText = "🔄";
        document.getElementById('transfer-source-status-label').innerText = "إجمالي الدين المتبقي على الشركة:";
        document.getElementById('transfer-source-total-amount').innerText = `$ ${absUsd.toFixed(2)} (${absDzd.toLocaleString('fr-FR')} دج)`;
        document.getElementById('transfer-source-total-amount').className = "font-black text-red-600 text-sm";
    } else {
        header.className = "p-5 text-white flex justify-between items-center bg-gradient-to-r from-emerald-600 to-teal-700";
        confirmBtn.className = "flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black py-3 rounded-xl text-xs transition cursor-pointer shadow-lg shadow-emerald-600/20";
        title.innerText = `نقل الفائض / الرصيد الزائد (${source.name})`;
        icon.innerText = "💸";
        document.getElementById('transfer-source-status-label').innerText = "إجمالي الفائض / الرصيد الزائد المتاح:";
        document.getElementById('transfer-source-total-amount').innerText = `$ ${absUsd.toFixed(2)} (${absDzd.toLocaleString('fr-FR')} دج)`;
        document.getElementById('transfer-source-total-amount').className = "font-black text-emerald-600 text-sm";
    }

    // ملء قائمة الزبائن المستلمين (باستثناء الزبون المصدر)
    const targetSelect = document.getElementById('transfer-target-client-select');
    targetSelect.innerHTML = '<option value="">-- اختر الشركة / الزبون المستلم --</option>';
    
    clients.forEach(c => {
        if (c.id !== source.id && c.role === 'client') {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.innerText = `${c.name || c.phone} (سعر الصرف: ${c.exchange_rate || 240} دج)`;
            targetSelect.appendChild(opt);
        }
    });

    // إعادة ضبط الأوضاع
    document.getElementById('transfer-mode-full').checked = true;
    toggleTransferAmountMode('full');

    document.getElementById('transfer-exchange-rate-hint').innerText = `* سعر صرف المصدر: 1$ = ${exchangeRate} دج`;

    modal.classList.remove('hidden');
    updateTransferPreview();
}

function closeTransferModal() {
    document.getElementById('transfer-balance-modal').classList.add('hidden');
    currentTransferSourceClient = null;
}

function toggleTransferAmountMode(mode) {
    const container = document.getElementById('transfer-custom-amount-container');
    const fullLabel = document.getElementById('mode-full-label');
    const partialLabel = document.getElementById('mode-partial-label');
    const maxUsd = parseFloat(document.getElementById('transfer-max-amount-usd').value || 0);
    const sourceRate = parseFloat(currentTransferSourceClient?.exchange_rate || 240);

    if (mode === 'full') {
        container.classList.add('hidden');
        fullLabel.className = "flex items-center gap-2 p-3 bg-indigo-50/70 border-2 border-indigo-500 rounded-xl cursor-pointer";
        partialLabel.className = "flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100";
        document.getElementById('transfer-amount-usd-input').value = maxUsd.toFixed(2);
        document.getElementById('transfer-amount-dzd-input').value = Math.round(maxUsd * sourceRate);
    } else {
        container.classList.remove('hidden');
        partialLabel.className = "flex items-center gap-2 p-3 bg-purple-50/70 border-2 border-purple-500 rounded-xl cursor-pointer";
        fullLabel.className = "flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100";
        document.getElementById('transfer-amount-usd-input').value = (maxUsd / 2).toFixed(2);
        document.getElementById('transfer-amount-dzd-input').value = Math.round((maxUsd / 2) * sourceRate);
    }
    updateTransferPreview();
}

function handleTransferUsdChange() {
    const usd = parseFloat(document.getElementById('transfer-amount-usd-input').value || 0);
    const sourceRate = parseFloat(currentTransferSourceClient?.exchange_rate || 240);
    document.getElementById('transfer-amount-dzd-input').value = Math.round(usd * sourceRate);
    updateTransferPreview();
}

function handleTransferDzdChange() {
    const dzd = parseFloat(document.getElementById('transfer-amount-dzd-input').value || 0);
    const sourceRate = parseFloat(currentTransferSourceClient?.exchange_rate || 240);
    if (sourceRate > 0) {
        document.getElementById('transfer-amount-usd-input').value = (dzd / sourceRate).toFixed(2);
    }
    updateTransferPreview();
}

function updateTransferPreview() {
    const source = currentTransferSourceClient;
    if (!source) return;

    const type = document.getElementById('transfer-type').value;
    const targetId = document.getElementById('transfer-target-client-select').value;
    const clients = window.allClients || [];
    const target = clients.find(c => c.id === targetId);

    const isFull = document.getElementById('transfer-mode-full').checked;
    const maxUsd = parseFloat(document.getElementById('transfer-max-amount-usd').value || 0);
    const sourceRate = parseFloat(source.exchange_rate || 240);

    let transferUsd = isFull ? maxUsd : parseFloat(document.getElementById('transfer-amount-usd-input').value || 0);
    let transferDzd = Math.round(transferUsd * sourceRate);

    const sourcePreview = document.getElementById('transfer-preview-source-text');
    const targetPreview = document.getElementById('transfer-preview-target-text');

    const targetName = target ? (target.name || target.phone) : 'الطرف المستلم';

    if (type === 'debt') {
        sourcePreview.innerHTML = `• <strong class="text-indigo-900">${source.name}</strong>: سيتم تسجيل دفعة تسوية بقيمة <span class="text-emerald-600 font-bold">+${transferUsd.toFixed(2)}$ (${transferDzd.toLocaleString('fr-FR')} دج)</span> لإلغاء وتصفية الدين بملاحظة: <em class="text-gray-600">"تصفية دين ونقله إلى حساب (${targetName})"</em>.`;
        targetPreview.innerHTML = `• <strong class="text-indigo-900">${targetName}</strong>: سيتم تسجيل دفعة سالبة بقيمة <span class="text-red-600 font-bold">-${transferUsd.toFixed(2)}$ (-${transferDzd.toLocaleString('fr-FR')} دج)</span> لتحمل وزيادة الدين عليه بملاحظة: <em class="text-gray-600">"تحمل دين منقول من حساب (${source.name})"</em>.`;
    } else {
        sourcePreview.innerHTML = `• <strong class="text-indigo-900">${source.name}</strong>: سيتم خصم الفائض بقيمة <span class="text-red-600 font-bold">-${transferUsd.toFixed(2)}$ (-${transferDzd.toLocaleString('fr-FR')} دج)</span> بملاحظة: <em class="text-gray-600">"تحويل رصيد زائد إلى حساب (${targetName})"</em>.`;
        targetPreview.innerHTML = `• <strong class="text-indigo-900">${targetName}</strong>: سيتم إضافة الرصيد بقيمة <span class="text-emerald-600 font-bold">+${transferUsd.toFixed(2)}$ (${transferDzd.toLocaleString('fr-FR')} دج)</span> بملاحظة: <em class="text-gray-600">"استلام رصيد زائد منقول من حساب (${source.name})"</em>.`;
    }
}

async function handleBalanceTransferSubmit(event) {
    event.preventDefault();
    const source = currentTransferSourceClient;
    if (!source) return;

    const type = document.getElementById('transfer-type').value;
    const targetId = document.getElementById('transfer-target-client-select').value;
    if (!targetId) {
        showToast("يرجى اختيار الشركة أو الزبون المستلم للتحويل.", "error");
        return;
    }

    const clients = window.allClients || [];
    const target = clients.find(c => c.id === targetId);
    if (!target) {
        showToast("تعذر العثور على بيانات الزبون المستلم.", "error");
        return;
    }

    const isFull = document.getElementById('transfer-mode-full').checked;
    const maxUsd = parseFloat(document.getElementById('transfer-max-amount-usd').value || 0);
    const sourceRate = parseFloat(source.exchange_rate || 240);

    let transferUsd = isFull ? maxUsd : parseFloat(document.getElementById('transfer-amount-usd-input').value || 0);

    if (isNaN(transferUsd) || transferUsd <= 0) {
        showToast("يرجى إدخال مبلغ تحويل صحيح أكبر من الصفر.", "error");
        return;
    }

    if (transferUsd > maxUsd + 0.001) {
        showToast(`المبلغ المدخل ($${transferUsd.toFixed(2)}) يتجاوز إجمالي المبلغ المتاح للتحويل ($${maxUsd.toFixed(2)}).`, "error");
        return;
    }

    const transferDzd = Math.round(transferUsd * sourceRate);
    const targetName = target.name || target.phone;
    const sourceName = source.name || source.phone;
    const today = new Date().toISOString().split('T')[0];

    const confirmBtn = document.getElementById('transfer-confirm-btn');
    confirmBtn.disabled = true;
    confirmBtn.innerText = "⏳ جاري تنفيذ التحويل وتثبيت القيود...";

    try {
        let sourceAmountEuro, sourceAmountDzd, sourceNote;
        let targetAmountEuro, targetAmountDzd, targetNote;

        if (type === 'debt') {
            // المصدر يسجل دفعة موجبة لتصفية دينه
            sourceAmountEuro = transferUsd;
            sourceAmountDzd = transferDzd;
            sourceNote = `تصفية دين ونقله إلى حساب (${targetName})`;

            // المستلم يسجل دفعة سالبة ليتحمل الدين
            targetAmountEuro = -transferUsd;
            targetAmountDzd = -transferDzd;
            targetNote = `تحمل دين منقول من حساب (${sourceName})`;
        } else {
            // المصدر يخصم منه الفائض (سالب)
            sourceAmountEuro = -transferUsd;
            sourceAmountDzd = -transferDzd;
            sourceNote = `تحويل رصيد زائد إلى حساب (${targetName})`;

            // المستلم يضاف له الرصيد (موجب)
            targetAmountEuro = transferUsd;
            targetAmountDzd = transferDzd;
            targetNote = `استلام رصيد زائد منقول من حساب (${sourceName})`;
        }

        // 1. إدراج حركة المصدر في payments
        const { data: sourcePayment, error: sourceErr } = await _supabase
            .from('payments')
            .insert([{
                client_id: source.id,
                amount_euro: sourceAmountEuro,
                amount_dzd: sourceAmountDzd,
                date: today,
                note: sourceNote
            }])
            .select()
            .single();

        if (sourceErr) throw sourceErr;

        // 2. إدراج حركة المستلم في payments
        const { data: targetPayment, error: targetErr } = await _supabase
            .from('payments')
            .insert([{
                client_id: target.id,
                amount_euro: targetAmountEuro,
                amount_dzd: targetAmountDzd,
                date: today,
                note: targetNote
            }])
            .select()
            .single();

        if (targetErr) throw targetErr;

        // 3. أرشفة الحركات في profits_archive كحركات رأس مال محايدة (بدون أرباح إضافية)
        const nowIso = new Date().toISOString();
        await _supabase.from('profits_archive').insert([
            {
                payment_id: sourcePayment.id,
                client_name: sourceName,
                amount_received: sourceAmountDzd,
                ad_capital: sourceAmountDzd,
                total_profit: 0,
                company_profit: 0,
                my_profit: 0,
                created_at: nowIso
            },
            {
                payment_id: targetPayment.id,
                client_name: targetName,
                amount_received: targetAmountDzd,
                ad_capital: targetAmountDzd,
                total_profit: 0,
                company_profit: 0,
                my_profit: 0,
                created_at: nowIso
            }
        ]);

        closeTransferModal();
        showToast(`تم تنفيذ التحويل بنجاح بين (${sourceName}) و (${targetName})!`, "success");

        // إعادة تحميل البيانات
        await loadAdminData();

    } catch (err) {
        console.error("Error executing balance transfer:", err);
        showToast("حدث خطأ أثناء تنفيذ التحويل. يرجى المحاولة لاحقاً.", "error");
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerText = "🚀 تأكيد وتنفيذ التحويل";
    }
}

window.openTransferModal = openTransferModal;
window.closeTransferModal = closeTransferModal;
window.toggleTransferAmountMode = toggleTransferAmountMode;
window.handleTransferUsdChange = handleTransferUsdChange;
window.handleTransferDzdChange = handleTransferDzdChange;
window.updateTransferPreview = updateTransferPreview;
window.handleBalanceTransferSubmit = handleBalanceTransferSubmit;




// ==========================================
//  تحميل البطاقات الإحصائية السريعة
// ==========================================
async function loadSummaryCards() {
    // 1. جلب دفعات هذا الشهر من profits_archive
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const { data: monthRecords } = await _supabase
        .from('profits_archive')
        .select('amount_received, company_profit, my_profit')
        .gte('created_at', startOfMonth)
        .lte('created_at', endOfMonth);

    let monthPayments  = 0;
    let monthCompany   = 0;
    let monthMyProfit  = 0;

    (monthRecords || []).forEach(r => {
        monthPayments += parseFloat(r.amount_received || 0);
        monthCompany  += parseFloat(r.company_profit  || 0);
        monthMyProfit += parseFloat(r.my_profit       || 0);
    });

    // 2. حساب الأرصدة الموجبة والسالبة من جدول الزبائن
    const metaCampaigns = await getCampaignsFromSupabase() || [];
    const { data: clients } = await _supabase
        .from('clients')
        .select('id, campaign_keyword, exchange_rate')
        .eq('role', 'client');

    let totalPositive = 0;
    let totalNegative = 0;

    const promises = (clients || []).map(async client => {
        let spendEuro = 0;
        metaCampaigns.forEach(camp => {
            if (isKeywordMatched(camp.name, client.campaign_keyword)) {
                spendEuro += parseFloat(camp.insights?.data?.[0]?.spend || 0);
            }
        });
        const spendWithProfit = spendEuro * 1.2;
        const { data: payments } = await _supabase
            .from('payments')
            .select('amount_euro')
            .eq('client_id', client.id);
        const totalPaid = (payments || []).reduce((s, p) => s + parseFloat(p.amount_euro || 0), 0);
        const remaining = spendWithProfit - totalPaid;
        const debtDzd   = Math.round(remaining * (client.exchange_rate || 240));
        if (debtDzd > 0) totalNegative += debtDzd;
        else              totalPositive += Math.abs(debtDzd);
    });

    await Promise.all(promises);

    // 3. جلب وحساب التكاليف والربح الصافي
    let totalExpenses = 0;
    try {
        const { data: expensesList } = await _supabase
            .from('company_expenses')
            .select('amount_dzd');
        totalExpenses = (expensesList || []).reduce((s, e) => s + parseFloat(e.amount_dzd || 0), 0);
    } catch (errExpenses) {
        console.error("Failed to load total expenses:", errExpenses);
    }

    let totalCompanyProfit = 0;
    try {
        const { data: allProfits } = await _supabase
            .from('profits_archive')
            .select('company_profit');
        totalCompanyProfit = (allProfits || []).reduce((s, r) => s + parseFloat(r.company_profit || 0), 0);
    } catch (errProfits) {
        console.error("Failed to load total company profit:", errProfits);
    }

    const netProfit = totalCompanyProfit - totalExpenses;

    // 4. تحديث الواجهة
    const fmt = n => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' دج';
    document.getElementById('summary-month-payments').innerText = fmt(monthPayments);
    document.getElementById('summary-positive').innerText       = fmt(totalPositive);
    document.getElementById('summary-negative').innerText       = fmt(totalNegative);
    document.getElementById('summary-company-month').innerText  = fmt(monthCompany);
    document.getElementById('summary-my-month').innerText       = fmt(monthMyProfit);
    
    const totalExpensesEl = document.getElementById('summary-total-expenses');
    if (totalExpensesEl) totalExpensesEl.innerText = fmt(totalExpenses);

    const netProfitEl = document.getElementById('summary-net-profit');
    if (netProfitEl) netProfitEl.innerText = fmt(netProfit);
}

// ==========================================
//  إدارة نافذة إضافة زبون جديد
// ==========================================




function openModal(id) {
    if (id === 'client-modal') document.getElementById('client-modal').classList.remove('hidden');
}




function closeClientModal() {
    document.getElementById('client-modal').classList.add('hidden');
}

async function saveNewClient() {
    const name = document.getElementById('new-client-name').value.trim();
    const phone = document.getElementById('new-client-phone').value.trim();
    const email = document.getElementById('new-client-email').value.trim();
    const password = document.getElementById('new-client-pass').value.trim();
    const keyword = document.getElementById('new-client-keyword').value.trim();
    const rate = document.getElementById('new-client-rate').value.trim();
    if (!name || !phone || !email || !password || !keyword || !rate) return;
    await _supabase.from('clients').insert([{ name, phone, email, password, role: 'client', campaign_keyword: keyword, exchange_rate: parseInt(rate) }]);
    closeClientModal();
    loadAdminData();
}





// ==========================================
//  إدارة نافذة تسجيل الدفعات اليدوية
// ==========================================
window.openPaymentModal = async function () {
    const modal = document.getElementById('payment-modal');
    const select = document.getElementById('pop-client-select');
    document.getElementById('pop-payment-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('pop-payment-type').value = "ads";
    document.getElementById('pop-payment-note').value = "Versement";
    document.getElementById('pop-amount-dzd').value = "";
    document.getElementById('pop-amount-euro').value = "";
    document.getElementById('pop-exchange-rate').value = "";
    
    if (typeof handlePaymentTypeChange === 'function') {
        handlePaymentTypeChange();
    }

    select.innerHTML = '<option value="">-- جاري تحميل الزبائن... --</option>';
    try {
        const { data: clients, error } = await _supabase.from('clients').select('id, name, exchange_rate').order('name', { ascending: true });
        if (error) throw error;
        select.innerHTML = '<option value="">-- اختر الزبون من القائمة --</option>';
        clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.setAttribute('data-name', client.name);
            option.setAttribute('data-rate', client.exchange_rate || 240);
            option.innerText = client.name;
            select.appendChild(option);
        });
    } catch (e) {
        console.error("خطأ في جلب قائمة الزبائن:", e);
        select.innerHTML = '<option value="">❌ فشل تحميل الزبائن</option>';
    }
};

window.handlePaymentTypeChange = function () {
    const type = document.getElementById('pop-payment-type').value;
    const submitBtn = document.getElementById('pop-submit-btn');
    const noteInput = document.getElementById('pop-payment-note');
    const modalHeader = document.getElementById('payment-modal-header');

    if (type === 'debt') {
        if (modalHeader) {
            modalHeader.className = "bg-red-600 p-4 text-white text-center font-bold text-lg transition-colors";
            modalHeader.innerText = "🔴 إضافة دين / رسوم خدمة على الزبون";
        }
        if (submitBtn) {
            submitBtn.className = "w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-sm transition shadow cursor-pointer";
            submitBtn.innerText = "🔴 تأكيد تسجيل الدين على الزبون";
        }
        if (noteInput && (noteInput.value === "Versement" || !noteInput.value)) {
            noteInput.value = "شراء خدمة إضافية";
            noteInput.placeholder = "مثال: شراء خدمة تصميم، مفتاح كانفا، إلخ...";
        }
    } else {
        if (modalHeader) {
            modalHeader.className = "bg-amber-500 p-4 text-white text-center font-bold text-lg transition-colors";
            modalHeader.innerText = "💰 تسجيل دفعة مالية جديدة";
        }
        if (submitBtn) {
            submitBtn.className = "w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-sm transition shadow cursor-pointer";
            submitBtn.innerText = "✅ حفظ وتوزيع الأرباح";
        }
        if (noteInput && (noteInput.value === "شراء خدمة إضافية" || !noteInput.value)) {
            noteInput.value = "Versement";
            noteInput.placeholder = "اكتب الملاحظة أو سبب الدين هنا...";
        }
    }
};

// دالة جلب سعر الصرف عند تغيير الزبون
window.handleClientSelection = function() {
    const selectEl = document.getElementById('pop-client-select');
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    if (!selectedOption || !selectEl.value) return;
    const rate = parseFloat(selectedOption.getAttribute('data-rate')) || 240;
    document.getElementById('pop-exchange-rate').value = rate;
    updateEuroFromDzd(); // تحديث الحساب تلقائياً
}

// تحديث المبالغ بناء على السعر القابل للتعديل
window.updateEuroFromDzd = function() {
    const rateInput = document.getElementById('pop-exchange-rate').value;
    const rate = parseFloat(rateInput) || 240;
    const amountDzd = parseFloat(document.getElementById('pop-amount-dzd').value) || 0;
    if (amountDzd > 0) {
        document.getElementById('pop-amount-euro').value = (amountDzd / rate).toFixed(2);
    } else {
        document.getElementById('pop-amount-euro').value = "";
    }
}

function closePaymentModal() {
    document.getElementById('payment-modal').classList.add('hidden');
    document.getElementById('manual-payment-form').reset();
}

async function submitManualPayment(event) {
    event.preventDefault();
    const selectEl = document.getElementById('pop-client-select');
    const clientId = selectEl.value;
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const clientName = selectedOption.getAttribute('data-name');
    const amountDzd = parseFloat(document.getElementById('pop-amount-dzd').value);
    const amountEuro = parseFloat(document.getElementById('pop-amount-euro').value);
    const currentExchangeRate = parseFloat(document.getElementById('pop-exchange-rate').value) || 240;
    const paymentDate = document.getElementById('pop-payment-date').value;
    const paymentType = document.getElementById('pop-payment-type').value;
    let paymentNote = document.getElementById('pop-payment-note').value.trim();
    
    if (!clientId || !amountDzd || isNaN(amountEuro) || !paymentDate) {
        alert("يرجى ملء الحقول الأساسية بشكل صحيح.");
        return;
    }

    let finalAmountDzd = amountDzd;
    let finalAmountEuro = amountEuro;

    if (paymentType === 'debt') {
        // الدين يحسب بالسالب في سجل المدفوعات لزيادة المستحقات
        finalAmountDzd = -Math.abs(amountDzd);
        finalAmountEuro = -Math.abs(amountEuro);
        if (!paymentNote) {
            paymentNote = 'دين إضافي / رسوم خدمة';
        }
    } else {
        // إلحاق نوع الدفعة بالملاحظة للتوضيح المالي
        let typeLabel = "شحن إعلانات";
        if (paymentType === 'views') typeLabel = "شحن مشاهدات";
        if (paymentType === 'services') typeLabel = "شحن شراء خدمات";
        
        if (!paymentNote) {
            paymentNote = `Versement (${typeLabel})`;
        } else {
            paymentNote = `${paymentNote} (${typeLabel})`;
        }
    }

    try {
        const { data: newPayment, error: payErr } = await _supabase
            .from('payments')
            .insert([{ client_id: clientId, amount_dzd: finalAmountDzd, amount_euro: finalAmountEuro, note: paymentNote, date: paymentDate }])
            .select().single();
        if (payErr) throw payErr;

        // تحديث سعر الصرف الخاص بالزبون لكي يحفظ للدفعة القادمة
        const oldRate = parseFloat(selectedOption.getAttribute('data-rate')) || 240;
        if (currentExchangeRate !== oldRate) {
            await _supabase.from('clients').update({ exchange_rate: currentExchangeRate }).eq('id', clientId);
        }

        // احتساب الأرباح حسب نوع الدفعة
        let adCapital = finalAmountDzd;
        let totalProfit = 0;
        let companyProfit = 0;
        let myProfit = 0;

        if (paymentType === 'ads') {
            // دفعة إعلانات: فائدة 20%
            adCapital = parseFloat((amountDzd * 0.8).toFixed(2));
            totalProfit = parseFloat((amountDzd - adCapital).toFixed(2));
            companyProfit = parseFloat((totalProfit * 0.30).toFixed(2));
            myProfit = parseFloat((totalProfit * 0.70).toFixed(2));
        }

        const nowTime = new Date().toISOString().split('T')[1];
        const timestampWithTime = `${paymentDate}T${nowTime}`;
        const { error: arcErr } = await _supabase.from('profits_archive').insert([{
            payment_id: newPayment.id, client_name: clientName, amount_received: finalAmountDzd,
            ad_capital: adCapital, total_profit: totalProfit, company_profit: companyProfit,
            my_profit: myProfit, created_at: timestampWithTime
        }]);
        if (arcErr) throw arcErr;

        if (paymentType === 'debt') {
            showSuccessNotification(`تم تسجيل دين إضافي بقيمة: ${amountDzd.toLocaleString('fr-FR')} دج على حساب (${clientName})`);
        } else {
            showSuccessNotification(`تم الحفظ بنجاح: ${amountDzd.toLocaleString('fr-FR')} دج`);
        }
        closePaymentModal();
        if (typeof loadAdminData === 'function') loadAdminData();
        if (typeof loadAnalyticsData === 'function') loadAnalyticsData();
    } catch (err) {
        console.error("خطأ أثناء معالجة وحفظ الدفعة:", err);
        alert(`❌ فشل الاتصال بقاعدة البيانات: ${err.message}`);
    }
}

// إشعار الحفظ الجانبي مع الرنة (بدل نافذة Alert المزعجة)
function showSuccessNotification(message) {
    // تشغيل الرنة
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play().catch(() => {}); // نتجاهل الخطأ إذا منع المتصفح الصوت

    let toast = document.getElementById('success-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'success-toast';
        toast.className = 'fixed top-5 right-5 bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-2xl z-[100] transform transition-all duration-300 translate-x-full opacity-0 flex items-center gap-2 font-bold';
        toast.innerHTML = `<span>✅</span> <span id="toast-message"></span>`;
        document.body.appendChild(toast);
    }
    document.getElementById('toast-message').innerText = message;
    setTimeout(() => { toast.classList.remove('translate-x-full', 'opacity-0'); }, 10);
    setTimeout(() => { toast.classList.add('translate-x-full', 'opacity-0'); }, 3000);
}

// ==========================================
//  إدارة نافذة دفعات الزبون
// ==========================================
async function openClientPayments(clientId, clientName) {
    document.getElementById('payments-modal-title').innerText = `دفعات الزبون: ${clientName}`;
    document.getElementById('client-payments-modal').classList.remove('hidden');
    const tbody = document.getElementById('client-payments-list');
    const noMsg = document.getElementById('no-payments-msg');
    const { data: payments, error } = await _supabase
        .from('payments')
        .select('*')
        .eq('client_id', clientId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });

    tbody.innerHTML = '';
    if (!payments || payments.length === 0) {
        noMsg.classList.remove('hidden');
        return;
    }

    // ترتيب الدفعات: الأحدث أولاً بدقة
    payments.sort((a, b) => {
        const timeA = new Date(a.created_at || a.date || 0).getTime();
        const timeB = new Date(b.created_at || b.date || 0).getTime();
        if (timeB !== timeA) return timeB - timeA;
        return (b.id || '').localeCompare(a.id || '');
    });

    payments.forEach(p => {
        tbody.innerHTML += `
            <tr class="hover:bg-gray-50">
                <td class="p-3 text-gray-500">${p.date}</td>
                <td class="p-3 font-bold">${parseFloat(p.amount_dzd).toLocaleString('fr-FR')} دج</td>
                <td class="p-3 text-emerald-600 font-medium">${parseFloat(p.amount_euro).toFixed(2)} $</td>
                <td class="p-3 text-gray-500">${p.note || '-'}</td>
                <td class="p-3">
                    <div class="flex gap-2 justify-center">
                        <button onclick="openEditPayment('${p.id}', ${p.amount_dzd}, ${p.amount_euro}, '${p.date}', '${p.note || ''}')"
                            class="bg-amber-100 hover:bg-amber-200 text-amber-700 font-bold px-3 py-1 rounded-lg text-xs cursor-pointer transition">✏️ تعديل</button>
                        <button onclick="deletePayment('${p.id}', '${clientId}', '${clientName}')"
                            class="bg-red-100 hover:bg-red-200 text-red-700 font-bold px-3 py-1 rounded-lg text-xs cursor-pointer transition">🗑️ حذف</button>
                    </div>
                </td>
            </tr>`;
    });
}

function closePaymentsModal() {
    document.getElementById('client-payments-modal').classList.add('hidden');
}

function openEditPayment(id, dzd, euro, date, note) {
    document.getElementById('edit-payment-id').value = id;
    document.getElementById('edit-amount-dzd').value = dzd;
    document.getElementById('edit-amount-euro').value = euro;
    document.getElementById('edit-payment-date').value = date;
    document.getElementById('edit-payment-note').value = note;
    document.getElementById('edit-payment-modal').classList.remove('hidden');
}

async function saveEditedPayment(event) {
    event.preventDefault();
    const paymentId = document.getElementById('edit-payment-id').value;
    const amountDzd = parseFloat(document.getElementById('edit-amount-dzd').value);
    const amountEuro = parseFloat(document.getElementById('edit-amount-euro').value);
    const date = document.getElementById('edit-payment-date').value;
    const note = document.getElementById('edit-payment-note').value.trim() || 'Versement';

    if (!amountDzd || !amountEuro || !date) {
        alert("يرجى ملء جميع الحقول.");
        return;
    }

    try {
        // 1. تحديث الدفعة في جدول payments
        const { error: paymentError } = await _supabase.from('payments').update({ amount_dzd: amountDzd, amount_euro: amountEuro, date, note }).eq('id', paymentId);
        if (paymentError) throw paymentError;

        // 2. إعادة حساب الأرباح
        const adCapital = parseFloat((amountDzd * 0.8).toFixed(2));
        const totalProfit = parseFloat((amountDzd - adCapital).toFixed(2));
        const companyProfit = parseFloat((totalProfit * 0.30).toFixed(2));
        const myProfit = parseFloat((totalProfit * 0.70).toFixed(2));
        const timestampWithTime = `${date}T12:00:00Z`;

        // 3. تحديث السجل المرتبط في جدول الأرشيف
        const { error: archiveError } = await _supabase.from('profits_archive')
            .update({
                amount_received: amountDzd,
                ad_capital: adCapital,
                total_profit: totalProfit,
                company_profit: companyProfit,
                my_profit: myProfit,
                created_at: timestampWithTime
            })
            .eq('payment_id', paymentId);

        if (archiveError) throw archiveError;

        showSuccessNotification("✅ تم تعديل الدفعة والأرشيف بنجاح!");
        document.getElementById('edit-payment-modal').classList.add('hidden');
        loadAdminData();
        if (typeof loadAnalyticsData === 'function') loadAnalyticsData();

    } catch (error) {
        alert(`❌ فشل التعديل: ${error.message}`);
    }
}

async function deletePayment(paymentId, clientId, clientName) {
    if (!confirm("⚠️ هل أنت متأكد من حذف هذه الدفعة؟ لا يمكن التراجع عن هذا الإجراء!")) return;

    try {
        // 1. حذف من جدول profits_archive أولاً (لأن فيه foreign key)
        const { error: archiveErr } = await _supabase
            .from('profits_archive')
            .delete()
            .eq('payment_id', paymentId);

        if (archiveErr) throw archiveErr;

        // 2. ثم حذف من جدول payments
        const { error: payErr } = await _supabase
            .from('payments')
            .delete()
            .eq('id', paymentId);

        if (payErr) throw payErr;

        showToast("تم حذف الدفعة بنجاح");
        openClientPayments(clientId, clientName);
        loadAdminData();

    } catch (err) {
        console.error("خطأ في الحذف:", err);
        alert("❌ فشل الحذف: " + err.message);
    }
}

// ==========================================
//  المساعد الصوتي الذكي
// ==========================================
function startVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("متصفحك لا يدعم التعرف على الصوت، يرجى استخدام Google Chrome.");
        return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'ar-DZ';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    const btn = document.getElementById('voice-btn');
    const status = document.getElementById('voice-status');
    const resultTxt = document.getElementById('voice-result-text');
    recognition.onstart = () => {
        status.innerText = "جاري الاستماع... تكلم الآن";
        btn.classList.add('animate-pulse', 'bg-red-50', 'text-red-600');
    };
    recognition.onerror = () => {
        status.innerText = "حدث خطأ في الاستماع، جرب مرة أخرى.";
        btn.classList.remove('animate-pulse', 'bg-red-50', 'text-red-600');
    };
    recognition.onend = () => {
        btn.classList.remove('animate-pulse', 'bg-red-50', 'text-red-600');
    };
    recognition.onresult = async (event) => {
        const textSpoken = event.results[0][0].transcript;
        resultTxt.innerText = `قلت: "${textSpoken}"`;
        resultTxt.classList.remove('hidden');
        status.innerText = "جاري تحليل الكلام وفهم الطلب...";
        await processVoiceWithAI(textSpoken);
    };
    recognition.start();
}

async function processVoiceWithAI(text) {
    const status = document.getElementById('voice-status');
    const prompt = `
    أنت نظام مالي جزائري ذكي يدير الحسابات والإعلانات. قم بتحليل الجملة التالية المكتوبة بالدارجة أو العربية وحدد نية المستخدم (Intent).
    الجملة: "${text}"

    يجب أن تحدد هل نية المستخدم هي:
    1. "insert": تسجيل دفعة مالية جديدة (مثل: سجل لمنير عشرة آلاف، أضف دفعة، دخلت مبلغا لفلان).
    2. "query": استعلام وسؤال عن الحسابات (مثل: شحال يسال منير، كم مستحقات منير).

    قواعد استخراج المبالغ بالدينار (DZD) في حالة الـ insert فقط:
    - "عشرين آلاف" أو "دوز ميا" تعني 20000، "مليون" يعني 10000، "ميا" تعني 1000.

    نوع الاستعلام (query_type) في حالة كان الطلب سؤالاً:
    - "balance": إذا كان السؤال عن إجمالي المستحقات.
    - "last_payment": إذا كان السؤال عن الدفعة الأخيرة.
    - "last_campaign": إذا كان السؤال عن الإعلان الأخير أو مصاريفه.

    يجب أن يكون الرد بصيغة JSON كالتالي تماماً وبدون أي كلام إضافي:
    {
      "intent": "insert" أو "query",
      "client_keyword": "الكلمة المفتاحية أو اسم الزبون",
      "amount_dzd": 0,
      "query_type": "balance" أو "last_payment" أو "last_campaign" أو null
    }
    `;
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        let aiResponseText = data.candidates[0].content.parts[0].text.trim();
        aiResponseText = aiResponseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const resultJson = JSON.parse(aiResponseText);
        if (!resultJson.client_keyword) {
            speakAndStatus("لم أفهم اسم الزبون بوضوح، أعد المحاولة من فضلك.");
            return;
        }
        const { data: client } = await _supabase.from('clients').select('*').ilike('campaign_keyword', `%${resultJson.client_keyword}%`).maybeSingle();
        let targetClient = client;
        if (!targetClient) {
            const { data: clientByName } = await _supabase.from('clients').select('*').ilike('name', `%${resultJson.client_keyword}%`).maybeSingle();
            targetClient = clientByName;
        }
        if (!targetClient) {
            speakAndStatus(`❌ لم أجد زبون في النظام يطابق الاسم: ${resultJson.client_keyword}`);
            return;
        }
        if (resultJson.intent === 'insert') {
            await handleAiInsert(targetClient, resultJson);
        } else if (resultJson.intent === 'query') {
            await handleAiQuery(targetClient, resultJson);
        }
    } catch (e) {
        console.error(e);
        speakAndStatus("❌ فشل الاتصال بالذكاء الاصطناعي أو تحليل البيانات.");
    }
}

async function handleAiInsert(client, data) {
    if (!data.amount_dzd || data.amount_dzd <= 0) {
        speakAndStatus("لم أستطع تحديد المبلغ المراد تسجيله بوضوح.");
        return;
    }
    const amountDzd = data.amount_dzd;
    const rate = client.exchange_rate || 240;
    const calculatedEuro = parseFloat((amountDzd / rate).toFixed(2));
    const { data: newPayment, error: paymentErr } = await _supabase.from('payments')
        .insert([{ client_id: client.id, amount_dzd: amountDzd, amount_euro: calculatedEuro, note: "تسجيل صوتي تلقائي", date: new Date().toISOString().split('T')[0] }])
        .select().single();
    if (paymentErr) { speakAndStatus("❌ حدث خطأ أثناء حفظ الدفعة في جدول المدفوعات."); return; }
    const adCapital = parseFloat((amountDzd * 0.8).toFixed(2));
    const totalProfit = parseFloat((amountDzd - adCapital).toFixed(2));
    const companyProfit = parseFloat((totalProfit * 0.30).toFixed(2));
    const myProfit = parseFloat((totalProfit * 0.70).toFixed(2));
    const { error: archiveErr } = await _supabase.from('profits_archive').insert([{
        payment_id: newPayment.id, client_name: client.name, amount_received: amountDzd,
        ad_capital: adCapital, total_profit: totalProfit, company_profit: companyProfit, my_profit: myProfit
    }]);
    if (archiveErr) {
        speakAndStatus("⚠️ تم تسجيل الدفعة، لكن فشل ترحيل الأرباح إلى جدول الأرشيف.");
    } else {
        speakAndStatus(`تم بنجاح تسجيل الدفعة وحساب أرباحك الصافية وهي ${myProfit} دينار وتم أرشفة العملية.`);
        loadAdminData();
    }
}

async function handleAiQuery(client, data) {
    if (data.query_type === 'balance') {
        const metaCampaigns = await getAndSyncCampaigns();
        let totalSpendEuro = 0;
        metaCampaigns.forEach(camp => {
            if (camp.name.toLowerCase().includes(client.campaign_keyword.toLowerCase())) {
                if (camp.insights?.data?.[0]) totalSpendEuro += parseFloat(camp.insights.data[0].spend || 0);
            }
        });
        const { data: payments } = await _supabase.from('payments').select('amount_euro').eq('client_id', client.id);
        let totalPaidEuro = payments?.reduce((sum, item) => sum + parseFloat(item.amount_euro || 0), 0) || 0;
        let remainingEuro = totalSpendEuro - totalPaidEuro;
        let finalDebtDzd = Math.round(remainingEuro * (client.exchange_rate || 240));
        if (finalDebtDzd > 0) {
            speakAndStatus(`إجمالي المستحقات الحالية على الزبون ${client.name} هي ${finalDebtDzd.toLocaleString('fr-FR')} دينار جزائري.`);
        } else if (finalDebtDzd < 0) {
            speakAndStatus(`الزبون ${client.name} لديه رصيد مسبق الدفع قيمته ${Math.abs(finalDebtDzd).toLocaleString('fr-FR')} دينار جزائري.`);
        } else {
            speakAndStatus(`حساب الزبون ${client.name} متوازن تماماً، ومستحقاته الحالية هي صفر دينار.`);
        }
    } else if (data.query_type === 'last_payment') {
        const { data: lastPayment, error } = await _supabase.from('payments').select('*').eq('client_id', client.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (error || !lastPayment) {
            speakAndStatus(`لا توجد أي مدفوعات مسجلة سابقاً في النظام للزبون ${client.name}.`);
        } else {
            const pDate = lastPayment.date || "تاريخ غير محدد";
            speakAndStatus(`الدفعة الأخيرة للزبون ${client.name} كانت بتاريخ ${pDate} بقيمة ${lastPayment.amount_dzd.toLocaleString('fr-FR')} دينار جزائري.`);
        }
    } else if (data.query_type === 'last_campaign') {
        const metaCampaigns = await getAndSyncCampaigns();
        let lastCamp = metaCampaigns.find(camp => camp.name.toLowerCase().includes(client.campaign_keyword.toLowerCase()));
        if (lastCamp && lastCamp.insights?.data?.[0]) {
            let spendEuro = parseFloat(lastCamp.insights.data[0].spend || 0);
            let spendDzd = Math.round(spendEuro * (client.exchange_rate || 240));
            speakAndStatus(`تكلفة الإعلان الأخير للزبون ${client.name} المسمى ${lastCamp.name} بلغت ${spendEuro.toFixed(2)} دولار، أي ما يعادل ${spendDzd.toLocaleString('fr-FR')} دينار جزائري.`);
        } else {
            speakAndStatus(`لم أجد أي حملات إعلانية نشطة أو حديثة حالياً للزبون ${client.name} على فيسبوك.`);
        }
    }
}

function speakAndStatus(message) {
    document.getElementById('voice-status').innerText = message;
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.lang = 'ar-SA';
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
    }
}

// ==========================================
//  تسجيل الخروج
// ==========================================
function handleLogout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

// ==========================================
//  التحقق من طلبات التسجيل المعلقة والعداد
// ==========================================
async function checkPendingRequests() {
    try {
        // 1. جلب عدد طلبات التسجيل المعلقة
        const { count: regCount, error: regError } = await _supabase
            .from('clients')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'pending');
            
        // 2. جلب عدد طلبات شحن الرصيد المعلقة
        const { count: payCount, error: payError } = await _supabase
            .from('payment_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
            
        // 3. جلب عدد طلبات الخدمات المعلقة
        const { count: srvCount, error: srvError } = await _supabase
            .from('service_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        // 4. جلب عدد النزاعات النشطة المعلقة
        const { count: disputeCount, error: disputeError } = await _supabase
            .from('service_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'disputed');
        
        let totalCount = 0;
        if (!regError && regCount !== null) totalCount += regCount;
        if (!payError && payCount !== null) totalCount += payCount;
        if (!srvError && srvCount !== null) totalCount += srvCount;
        if (!disputeError && disputeCount !== null) totalCount += disputeCount;
        
        const badge = document.getElementById('pending-badge');
        if (badge) {
            if (totalCount > 0) {
                badge.innerText = totalCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch (e) {
        console.error("خطأ في التحقق من عدد الطلبات المعلقة:", e);
    }
}

// ==========================================
//  إدارة وتعديل وحذف الزبائن
// ==========================================
function openManageClientsModal() {
    const select = document.getElementById('manage-client-select');
    select.innerHTML = '<option value="">-- اختر زبوناً --</option>';
    
    const clients = window.allClients || [];
    const filtered = clients.filter(c => c.role === 'client');
    
    filtered.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.innerText = c.name || c.phone;
        select.appendChild(opt);
    });
    
    document.getElementById('manage-clients-modal').classList.remove('hidden');
}

function closeManageClientsModal() {
    document.getElementById('manage-client-fields').classList.add('hidden');
    document.getElementById('manage-client-select').value = '';
    document.getElementById('manage-clients-modal').classList.add('hidden');
}

function loadClientDetailsToManage() {
    const id = document.getElementById('manage-client-select').value;
    const fields = document.getElementById('manage-client-fields');
    
    if (!id) {
        fields.classList.add('hidden');
        return;
    }
    
    const client = (window.allClients || []).find(c => c.id === id);
    if (!client) {
        fields.classList.add('hidden');
        return;
    }
    
    document.getElementById('manage-client-name').value = client.name || '';
    document.getElementById('manage-client-phone').value = client.phone || '';
    document.getElementById('manage-client-email').value = client.email || '';
    document.getElementById('manage-client-pass').value = ''; // نتركها فارغة لحماية الخصوصية ولا نعرضها للأدمن
    document.getElementById('manage-client-keyword').value = client.campaign_keyword || '';
    document.getElementById('manage-client-rate').value = client.exchange_rate || 230;
    
    fields.classList.remove('hidden');
}

async function hashPassword(password) {
    if (!password) return '';
    try {
        const msgBuffer = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        console.error("Hashing failed", e);
        return btoa(unescape(encodeURIComponent(password)));
    }
}

async function saveManagedClient() {
    const id = document.getElementById('manage-client-select').value;
    const name = document.getElementById('manage-client-name').value.trim();
    const phone = document.getElementById('manage-client-phone').value.trim();
    const email = document.getElementById('manage-client-email').value.trim();
    const passwordInputVal = document.getElementById('manage-client-pass').value.trim();
    const keyword = document.getElementById('manage-client-keyword').value.trim();
    const rate = parseInt(document.getElementById('manage-client-rate').value) || 230;
    
    if (!name || !phone) {
        showToast("يرجى ملء الاسم الكامل ورقم الهاتف", "error");
        return;
    }
    
    try {
        const updateData = {
            name,
            phone,
            email,
            campaign_keyword: keyword,
            exchange_rate: rate
        };
        
        // لا نحدث كلمة السر إلا إذا كتب الأدمن كلمة جديدة
        if (passwordInputVal) {
            updateData.password = await hashPassword(passwordInputVal);
        }
        
        const { error } = await _supabase
            .from('clients')
            .update(updateData)
            .eq('id', id);
            
        if (error) throw error;
        
        showToast("تم تحديث بيانات الزبون بنجاح", "success");
        closeManageClientsModal();
        if (typeof loadAdminData === 'function') loadAdminData();
    } catch (e) {
        console.error(e);
        showToast("حدث خطأ أثناء تعديل بيانات الزبون", "error");
    }
}


async function deleteManagedClient() {
    const id = document.getElementById('manage-client-select').value;
    const client = (window.allClients || []).find(c => c.id === id);
    const clientName = client ? client.name : 'الزبون';
    
    if (!confirm(`⚠️ تحذير هام جداً:\nهل أنت متأكد من رغبتك في حذف الزبون "${clientName}" نهائياً؟\nسيتم حذف جميع الدفعات والحملات وسجلات الأرباح المرتبطة به ولا يمكن التراجع عن هذا الإجراء!`)) {
        return;
    }
    
    try {
        // 1. حذف الدفعات أولاً لتجنب مشاكل المفتاح الأجنبي
        const { error: err1 } = await _supabase
            .from('payments')
            .delete()
            .eq('client_id', id);
            
        if (err1) throw err1;

        // 2. حذف طلبات الشحن
        const { error: err2 } = await _supabase
            .from('payment_requests')
            .delete()
            .eq('client_id', id);
            
        if (err2) throw err2;
        
        // 3. حذف الزبون نفسه
        const { error: err3 } = await _supabase
            .from('clients')
            .delete()
            .eq('id', id);
            
        if (err3) throw err3;
        
        showToast(`تم حذف الزبون "${clientName}" بنجاح وتطهير كافة سجلاته`, "success");
        closeManageClientsModal();
        loadAdminData();
    } catch (err) {
        console.error(err);
        showToast("فشل حذف الزبون: " + err.message, "error");
    }
}

// ==========================================
//  تحديث ورسم المخططات البيانية للأدمن
// ==========================================
let monthlyProfitsChartInstance = null;
let clientSpendingChartInstance = null;

async function updateAdminCharts(clientNames, clientSpendings) {
    try {
        // 1. تحديث مخطط مقارنة صرف الزبائن
        const clientCtx = document.getElementById('clientSpendingChart').getContext('2d');
        if (clientSpendingChartInstance) {
            clientSpendingChartInstance.data.labels = clientNames;
            clientSpendingChartInstance.data.datasets[0].data = clientSpendings;
            clientSpendingChartInstance.update();
        } else {
            clientSpendingChartInstance = new Chart(clientCtx, {
                type: 'bar',
                data: {
                    labels: clientNames,
                    datasets: [{
                        label: 'صرف الإعلانات بالدولار ($)',
                        data: clientSpendings,
                        backgroundColor: 'rgba(99, 102, 241, 0.6)',
                        borderColor: 'rgb(99, 102, 241)',
                        borderWidth: 1,
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }

        // 2. جلب بيانات الدفعات والأرباح طوال السنة الحالية للمخطط الخطي
        const currentYear = new Date().getFullYear();
        const startOfYear = `${currentYear}-01-01T00:00:00Z`;
        const endOfYear = `${currentYear}-12-31T23:59:59Z`;
        
        const { data: yearRecords, error } = await _supabase
            .from('profits_archive')
            .select('amount_received, company_profit, my_profit, created_at')
            .gte('created_at', startOfYear)
            .lte('created_at', endOfYear);
            
        if (error) throw error;
        
        const monthlyData = Array.from({ length: 12 }, () => ({ payments: 0, company: 0, mine: 0 }));
        (yearRecords || []).forEach(r => {
            const d = new Date(r.created_at);
            const monthIndex = d.getMonth();
            if (monthIndex >= 0 && monthIndex < 12) {
                monthlyData[monthIndex].payments += parseFloat(r.amount_received || 0);
                monthlyData[monthIndex].company += parseFloat(r.company_profit || 0);
                monthlyData[monthIndex].mine += parseFloat(r.my_profit || 0);
            }
        });
        
        const months = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        const paymentsData = monthlyData.map(m => m.payments);
        const companyProfitData = monthlyData.map(m => m.company);
        const myProfitData = monthlyData.map(m => m.mine);
        
        const profitCtx = document.getElementById('monthlyProfitsChart').getContext('2d');
        if (monthlyProfitsChartInstance) {
            monthlyProfitsChartInstance.data.datasets[0].data = paymentsData;
            monthlyProfitsChartInstance.data.datasets[1].data = companyProfitData;
            monthlyProfitsChartInstance.data.datasets[2].data = myProfitData;
            monthlyProfitsChartInstance.update();
        } else {
            monthlyProfitsChartInstance = new Chart(profitCtx, {
                type: 'line',
                data: {
                    labels: months,
                    datasets: [
                        {
                            label: 'إجمالي المقبوضات (دج)',
                            data: paymentsData,
                            borderColor: 'rgb(245, 158, 11)',
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            tension: 0.3,
                            fill: true
                        },
                        {
                            label: 'أرباح الشركة 30% (دج)',
                            data: companyProfitData,
                            borderColor: 'rgb(99, 102, 241)',
                            backgroundColor: 'rgba(99, 102, 241, 0.1)',
                            tension: 0.3,
                            fill: true
                        },
                        {
                            label: 'أرباحي الخاصة 70% (دج)',
                            data: myProfitData,
                            borderColor: 'rgb(16, 185, 129)',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            tension: 0.3,
                            fill: true
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top', labels: { font: { family: 'sans-serif', size: 11 } } }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }
    } catch (e) {
        console.error("خطأ أثناء تحديث المخططات البيانية:", e);
    }
}

// ==========================================
//  التحكم في التبويبات (الرئيسية والإعدادات)
// ==========================================
window.switchAdminTab = function(tabName) {
    const dashboardView = document.getElementById('dashboard-view');
    const settingsView = document.getElementById('settings-view');
    const partnersView = document.getElementById('partners-view');
    const expensesView = document.getElementById('expenses-view');
    const vaultView = document.getElementById('vault-view');
    const ticketsView = document.getElementById('tickets-view');
    
    dashboardView.classList.add('hidden');
    dashboardView.classList.remove('block');
    settingsView.classList.add('hidden');
    settingsView.classList.remove('block');
    if (partnersView) {
        partnersView.classList.add('hidden');
        partnersView.classList.remove('block');
    }
    if (expensesView) {
        expensesView.classList.add('hidden');
        expensesView.classList.remove('block');
    }
    if (vaultView) {
        vaultView.classList.add('hidden');
        vaultView.classList.remove('block');
    }
    if (ticketsView) {
        ticketsView.classList.add('hidden');
        ticketsView.classList.remove('block');
    }
    
    if (tabName === 'dashboard') {
        dashboardView.classList.remove('hidden');
        dashboardView.classList.add('block');
    } else if (tabName === 'settings') {
        settingsView.classList.remove('hidden');
        settingsView.classList.add('block');
        hideSettingsDetail();
    } else if (tabName === 'partners') {
        if (partnersView) {
            partnersView.classList.remove('hidden');
            partnersView.classList.add('block');
        }
        loadPartnersViewData();
    } else if (tabName === 'expenses') {
        if (expensesView) {
            expensesView.classList.remove('hidden');
            expensesView.classList.add('block');
        }
        loadCompanyExpenses();
        loadCompanyDebts();
    } else if (tabName === 'vault') {
        if (vaultView) {
            vaultView.classList.remove('hidden');
            vaultView.classList.add('block');
        }
        loadVaultData();
    } else if (tabName === 'tickets') {
        if (ticketsView) {
            ticketsView.classList.remove('hidden');
            ticketsView.classList.add('block');
        }
        loadAdminTickets();
    }
};

// ==========================================
//  إعدادات الخصوصية بنظام الكروت (الجديد)
// ==========================================
window.showSettingsDetail = function(type) {
    window.activeSettingsType = type;
    
    const grid = document.getElementById('settings-cards-grid');
    const panel = document.getElementById('settings-detail-panel');
    const title = document.getElementById('settings-detail-title');
    const description = document.getElementById('settings-detail-description');
    const header = document.getElementById('settings-table-action-header');
    const list = document.getElementById('settings-detail-clients-list');
    
    if (!grid || !panel) return;
    
    list.innerHTML = '<tr><td colspan="2" class="p-4 text-center text-gray-400">جاري التحميل...</td></tr>';
    
    grid.classList.add('hidden');
    panel.classList.remove('hidden');
    
    const clients = window.allClients || [];
    const filtered = clients.filter(c => c.role === 'client');
    
    if (type === 'payments') {
        title.innerText = "💰 إدارة خصوصية رؤية الدفعات للزبائن";
        description.innerText = "حدد الزبائن الذين ترغب في إظهار جدول الدفعات والوصولات السابقة لهم في لوحاتهم. إلغاء التحديد يخفي الجدول بالكامل.";
        header.innerText = "هل يرى جدول سجل المدفوعات؟";
    } else {
        title.innerText = "📢 إدارة خصوصية رؤية الحملات الإعلانية للزبائن";
        description.innerText = "حدد الزبائن الذين ترغب في إظهار جدول الحملات الإعلانية النشطة من فيسبوك وتكاليفها وعمولتها لهم. إلغاء التحديد يخفي الجدول بالكامل.";
        header.innerText = "هل يرى جدول الإعلانات النشطة؟";
    }
    
    list.innerHTML = '';
    if (filtered.length === 0) {
        list.innerHTML = '<tr><td colspan="2" class="p-4 text-center text-gray-400 font-bold">لا يوجد أي زبائن مفعّلين حالياً في النظام.</td></tr>';
        return;
    }
    
    filtered.forEach(c => {
        const isChecked = type === 'payments' ? (c.show_payments_table !== false) : (c.show_campaigns_table !== false);
        
        const row = document.createElement('tr');
        row.className = 'settings-detail-row hover:bg-gray-50/50 transition';
        row.setAttribute('data-id', c.id);
        row.innerHTML = `
            <td class="p-3 font-bold text-gray-800">${c.name || c.phone}</td>
            <td class="p-3 text-center">
                <input type="checkbox" class="settings-cb h-5 w-5 accent-indigo-600 cursor-pointer" ${isChecked ? 'checked' : ''}>
            </td>
        `;
        list.appendChild(row);
    });
};

window.hideSettingsDetail = function() {
    const grid = document.getElementById('settings-cards-grid');
    const panel = document.getElementById('settings-detail-panel');
    if (grid && panel) {
        grid.classList.remove('hidden');
        panel.classList.add('hidden');
    }
};

window.saveDetailSettings = async function() {
    const rows = Array.from(document.querySelectorAll('.settings-detail-row'));
    if (rows.length === 0) {
        hideSettingsDetail();
        return;
    }
    
    const type = window.activeSettingsType;
    
    try {
        const updatePromises = rows.map(async row => {
            const clientId = row.getAttribute('data-id');
            const isChecked = row.querySelector('.settings-cb').checked;
            
            const updateData = {};
            if (type === 'payments') {
                updateData.show_payments_table = isChecked;
            } else {
                updateData.show_campaigns_table = isChecked;
            }
            
            return _supabase
                .from('clients')
                .update(updateData)
                .eq('id', clientId);
        });
        
        const results = await Promise.all(updatePromises);
        
        for (const res of results) {
            if (res.error) throw res.error;
        }
        
        showSuccessNotification("✅ تم حفظ إعدادات الخصوصية وتحديث لوحة الزبائن بنجاح!");
        hideSettingsDetail();
        
        if (typeof loadAdminData === 'function') loadAdminData();
    } catch (err) {
        console.error("خطأ في حفظ إعدادات الخصوصية:", err);
        alert(`❌ فشل حفظ الإعدادات: ${err.message}\nتأكد من تشغيل كود SQL أولاً لإضافة الأعمدة الجديدة.`);
    }
};

// ==========================================
//  نظام إدارة الشركاء ومقدمي الخدمات (الجديد)
// ==========================================
async function loadPartnersViewData() {
    try {
        await Promise.all([
            loadAdminPartnersList(),
            loadAdminPendingServices(),
            loadAdminPendingPayouts(),
            loadAdminPartnersStats(),
            loadAdminDisputes()
        ]);
    } catch (e) {
        console.error("Error loading partners view data:", e);
    }
}

async function loadAdminPartnersStats() {
    try {
        // 1. طلبات معلقة جديدة
        const { count: pendingCount } = await _supabase
            .from('service_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
            
        // 2. طلبات مرفوضة
        const { count: rejectedCount } = await _supabase
            .from('service_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'rejected');

        // 3. نزاعات وتبليغات نشطة
        const { count: disputesCount } = await _supabase
            .from('service_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'disputed');

        // 4. مستحقات الشركاء
        const { data: wallets } = await _supabase
            .from('provider_wallets')
            .select('payout_balance_usd');

        const totalUsd = wallets?.reduce((sum, w) => sum + parseFloat(w.payout_balance_usd || 0), 0) || 0;
        const totalDzd = Math.round(totalUsd * 220); // سعر صرف سحب الشركاء 220 دج

        // تحديث الواجهة
        document.getElementById('stat-pending-services-count').innerText = `${pendingCount || 0} طلب`;
        document.getElementById('stat-rejected-services-count').innerText = `${rejectedCount || 0} طلب`;
        document.getElementById('stat-disputes-count').innerText = `${disputesCount || 0} نزاع`;
        document.getElementById('stat-partners-holdings-usd').innerText = `$${totalUsd.toFixed(2)}`;
        document.getElementById('stat-partners-holdings-dzd').innerText = `${totalDzd.toLocaleString('fr-FR')} دج`;

    } catch (e) {
        console.error("Error loading partners stats:", e);
    }
}

async function loadAdminDisputes() {
    const table = document.getElementById('admin-disputes-table');
    const badge = document.getElementById('active-disputes-badge');
    if (!table) return;

    try {
        // جلب طلبات النزاعات
        const { data: disputes, error } = await _supabase
            .from('service_requests')
            .select('*')
            .eq('status', 'disputed')
            .order('created_at', { ascending: false });

        if (error) throw error;

        badge.innerText = `${disputes.length} نزاع`;

        if (disputes.length === 0) {
            table.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-400 font-bold">لا توجد نزاعات معلقة حالياً.</td></tr>`;
            return;
        }

        // جلب أسماء وهواتف مقدمي الخدمات للواتساب
        const { data: partners } = await _supabase
            .from('clients')
            .select('id, name, phone');

        table.innerHTML = '';
        disputes.forEach(d => {
            const partner = (partners || []).find(p => p.id === d.provider_id);
            const providerName = partner?.name || 'شريك غير معرف';
            const providerPhone = partner?.phone || '';
            const clientName = d.client_name || 'الزبون';

            // العثور على هاتف الزبون
            const clientObj = (partners || []).find(p => p.id === d.client_id);
            const clientPhoneVal = clientObj?.phone || '';

            const row = document.createElement('tr');
            row.className = 'hover:bg-red-50/20 transition border-b border-gray-100';
            row.innerHTML = `
                <td class="p-3 font-bold text-gray-800">${clientName}</td>
                <td class="p-3 font-bold text-gray-850">${providerName}</td>
                <td class="p-3 font-bold text-indigo-800">${d.service_title}</td>
                <td class="p-3 text-red-650 font-semibold max-w-xs truncate" title="${d.dispute_reason}">${d.dispute_reason}</td>
                <td class="p-3 font-black text-center">$${parseFloat(d.price_usd).toFixed(2)}</td>
                <td class="p-3 flex justify-center gap-1.5">
                    <a href="https://wa.me/${clientPhoneVal.replace(/\s+/g, '')}" target="_blank"
                        class="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-[10px] font-bold py-1.5 px-3 rounded-lg cursor-pointer transition">
                        💬 واتساب الزبون
                    </a>
                    <a href="https://wa.me/${providerPhone.replace(/\s+/g, '')}" target="_blank"
                        class="bg-indigo-50 hover:bg-indigo-100 text-indigo-650 text-[10px] font-bold py-1.5 px-3 rounded-lg cursor-pointer transition">
                        💬 واتساب الشريك
                    </a>
                </td>
            `;
            table.appendChild(row);
        });

    } catch (e) {
        console.error("Error loading disputes table:", e);
    }
}

async function loadAdminPartnersList() {
    const table = document.getElementById('admin-providers-list-table');
    const label = document.getElementById('partners-count-lbl');
    if (!table) return;

    try {
        // 1. جلب حسابات مقدمي الخدمات الشركاء
        const { data: providers, error } = await _supabase
            .from('clients')
            .select('id, name, phone, redotpay_id')
            .eq('role', 'provider');

        if (error) throw error;

        label.innerText = `${providers.length} شريك`;

        if (providers.length === 0) {
            table.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-400 font-bold">لا يوجد أي شركاء مسجلين.</td></tr>`;
            return;
        }

        // 2. جلب محافظ الأرباح الخاصة بهم
        const { data: wallets } = await _supabase
            .from('provider_wallets')
            .select('*');

        table.innerHTML = '';
        providers.forEach(p => {
            const wallet = (wallets || []).find(w => w.provider_id === p.id) || { total_requests: 0, completed_requests: 0, payout_balance_usd: 0 };
            
            const redotpayIdText = p.redotpay_id ? `<br><span class="text-[9px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-black">💳 RedotPay: ${p.redotpay_id}</span>` : '';

            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-50 transition border-b border-slate-50';
            row.innerHTML = `
                <td class="p-3 font-bold text-gray-800">${p.name}${redotpayIdText}</td>
                <td class="p-3 font-semibold text-gray-500">${p.phone}</td>
                <td class="p-3 text-center font-bold text-gray-650">${wallet.total_requests || 0}</td>
                <td class="p-3 text-center font-bold text-emerald-600">${wallet.completed_requests || 0}</td>
                <td class="p-3 text-center font-black text-indigo-750">$${parseFloat(wallet.payout_balance_usd || 0).toFixed(2)}</td>
                <td class="p-3 text-center">
                    <button onclick="deletePartnerAccount('${p.id}', '${p.name}')"
                        class="bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold py-1.5 px-3 rounded-lg cursor-pointer transition">
                        🗑️ حذف الشريك
                    </button>
                </td>
            `;
            table.appendChild(row);
        });

    } catch (e) {
        console.error(e);
    }
}

async function loadAdminPendingServices() {
    const table = document.getElementById('admin-pending-services-table');
    const badge = document.getElementById('pending-services-badge');
    if (!table) return;

    try {
        const { data: pendingServices, error } = await _supabase
            .from('services')
            .select('*')
            .eq('is_approved', false)
            .not('provider_id', 'is', null);

        if (error) throw error;

        badge.innerText = `${pendingServices.length} خدمة`;

        if (pendingServices.length === 0) {
            table.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-400 font-bold">لا توجد خدمات معلقة حالياً.</td></tr>`;
            return;
        }

        // جلب أسماء الشركاء
        const { data: providers } = await _supabase.from('clients').select('id, name').eq('role', 'provider');

        table.innerHTML = '';
        pendingServices.forEach(s => {
            const providerName = (providers || []).find(p => p.id === s.provider_id)?.name || 'شريك غير معرف';
            
            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-50 transition border-b border-slate-50';
            row.innerHTML = `
                <td class="p-3 font-bold text-gray-800">${providerName}</td>
                <td class="p-3 text-center">
                    <span class="text-2xl">${s.logo_url || '📦'}</span>
                </td>
                <td class="p-3 font-bold text-indigo-800">${s.title}</td>
                <td class="p-3 text-gray-500 text-xs max-w-xs truncate" title="${s.description}">${s.description}</td>
                <td class="p-3 font-black text-purple-700 text-center">$${parseFloat(s.price_usd).toFixed(2)}</td>
                <td class="p-3 flex justify-center gap-1.5">
                    <button onclick="approveService('${s.id}', '${s.title}')"
                        class="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg cursor-pointer transition">
                        ✅ موافقة
                    </button>
                    <button onclick="rejectService('${s.id}', '${s.title}')"
                        class="bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold py-1.5 px-3 rounded-lg cursor-pointer transition">
                        ❌ رفض
                    </button>
                </td>
            `;
            table.appendChild(row);
        });

    } catch (e) {
        console.error(e);
    }
}

async function loadAdminPendingPayouts() {
    const table = document.getElementById('admin-pending-payouts-table');
    const badge = document.getElementById('pending-payouts-badge');
    if (!table) return;

    try {
        const { data: pendingPayouts, error } = await _supabase
            .from('provider_payout_requests')
            .select('*')
            .eq('status', 'pending');

        if (error) throw error;

        badge.innerText = `${pendingPayouts.length} طلب`;

        if (pendingPayouts.length === 0) {
            table.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-400 font-bold">لا توجد طلبات سحب معلقة حالياً.</td></tr>`;
            return;
        }

        const { data: providers } = await _supabase.from('clients').select('id, name, redotpay_id').eq('role', 'provider');

        table.innerHTML = '';
        pendingPayouts.forEach(p => {
            const provider = (providers || []).find(pr => pr.id === p.provider_id);
            const providerName = provider?.name || 'شريك غير معرف';
            const redotpayIdText = provider?.redotpay_id ? `<br><span class="text-[9px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded font-black">💳 RedotPay: ${provider.redotpay_id}</span>` : '';
            
            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-50 transition border-b border-slate-50';
            row.innerHTML = `
                <td class="p-3 font-bold text-gray-800">${providerName}${redotpayIdText}</td>
                <td class="p-3 font-black text-indigo-750">$${parseFloat(p.amount_usd).toFixed(2)}</td>
                <td class="p-3 font-bold text-emerald-650">${parseFloat(p.amount_dzd).toLocaleString('fr-FR')} دج</td>
                <td class="p-3 font-bold text-gray-600 text-center">${p.payout_method}</td>
                <td class="p-3 text-xs text-gray-500 font-semibold max-w-xs" style="word-break: break-all;">${p.payout_details}</td>
                <td class="p-3 flex justify-center gap-1.5">
                    <button onclick="approvePayout('${p.id}', '${providerName}', ${p.amount_usd})"
                        class="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg cursor-pointer transition">
                        ✅ تم الدفع والتحويل
                    </button>
                    <button onclick="rejectPayout('${p.id}', '${providerName}', '${p.provider_id}', ${p.amount_usd})"
                        class="bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg cursor-pointer transition">
                        ❌ رفض وإرجاع الرصيد
                    </button>
                </td>
            `;
            table.appendChild(row);
        });

    } catch (e) {
        console.error(e);
    }
}

// الموافقة ورفض الخدمات المضافة
async function approveService(serviceId, title) {
    if (!confirm(`هل أنت متأكد من الموافقة على نشر خدمة الشريك (${title}) في متجر الزبائن؟`)) return;

    try {
        const { error } = await _supabase
            .from('services')
            .update({ is_approved: true })
            .eq('id', serviceId);

        if (error) throw error;

        alert(`تمت الموافقة بنجاح ونشر خدمة (${title}) للزبائن!`);
        loadPartnersViewData();

    } catch (e) {
        console.error(e);
        alert("فشل تحديث حالة الخدمة.");
    }
}

async function rejectService(serviceId, title) {
    const reason = prompt(`يرجى كتابة ملاحظة الرفض لخدمة (${title}):`);
    if (reason === null) return; // إلغاء

    try {
        // نضع قيمة الاعتماد كـ NULL (تعني مرفوضة ومحذوفة) أو نقوم بمسحها تماماً
        const { error } = await _supabase
            .from('services')
            .delete()
            .eq('id', serviceId);

        if (error) throw error;

        alert(`تم رفض وحذف الخدمة المقترحة (${title}) بنجاح.`);
        loadPartnersViewData();

    } catch (e) {
        console.error(e);
        alert("فشل تحديث حالة الخدمة.");
    }
}

// قبول ورفض سحب الرصيد
async function approvePayout(payoutId, providerName, amountUsd) {
    if (!confirm(`هل قمت بتحويل المستحقات المالية بالفعل للشريك (${providerName})؟\nالمبلغ: $${amountUsd}`)) return;

    try {
        const { error } = await _supabase
            .from('provider_payout_requests')
            .update({
                status: 'approved',
                admin_notes: 'تم التحويل بنجاح من قبل الأدمن'
            })
            .eq('id', payoutId);

        if (error) throw error;

        alert("تم تحديث حالة طلب السحب بنجاح إلى (مكتمل ومحول)!");
        loadPartnersViewData();

    } catch (e) {
        console.error(e);
        alert("حدث خطأ أثناء الموافقة على الدفع.");
    }
}

function rejectPayout(payoutId, providerName, providerId, amountUsd) {
    document.getElementById('rej-payout-id').value = payoutId;
    document.getElementById('rej-provider-id').value = providerId;
    document.getElementById('rej-payout-amount').value = amountUsd;
    document.getElementById('rej-payout-notes').value = '';
    
    document.getElementById('reject-payout-modal').classList.remove('hidden');
}

function closeRejectPayoutModal() {
    document.getElementById('reject-payout-modal').classList.add('hidden');
}

async function submitRejectPayoutForm(e) {
    if (e) e.preventDefault();
    
    const payoutId = document.getElementById('rej-payout-id').value;
    const providerId = document.getElementById('rej-provider-id').value;
    const amountUsd = parseFloat(document.getElementById('rej-payout-amount').value || 0);
    const notes = document.getElementById('rej-payout-notes').value.trim();

    try {
        // 1. تحديث الطلب كمرفوض
        const { error: updErr } = await _supabase
            .from('provider_payout_requests')
            .update({
                status: 'rejected',
                admin_notes: notes || 'مرفوض من قبل الإدارة'
            })
            .eq('id', payoutId);

        if (updErr) throw updErr;

        alert("تم رفض طلب السحب وإرجاع المبلغ لمحفظة الشريك بنجاح.");
        closeRejectPayoutModal();
        loadPartnersViewData();

    } catch (err) {
        console.error("Error in rejectPayout:", err);
        alert(`❌ حدث خطأ أثناء رفض المعاملة المالية: ${err.message || err}`);
    }
}

// إعدادات نافذة إنشاء حساب شريك جديد
function openAddPartnerModal() {
    document.getElementById('partner-form').reset();
    document.getElementById('partner-modal').classList.remove('hidden');
}

function closePartnerModal() {
    document.getElementById('partner-modal').classList.add('hidden');
}

async function saveNewPartner(e) {
    e.preventDefault();
    const name = document.getElementById('new-partner-name').value.trim();
    const phone = document.getElementById('new-partner-phone').value.trim();
    const email = document.getElementById('new-partner-email').value.trim();
    const password = document.getElementById('new-partner-pass').value.trim();

    try {
        // 1. حفظ في جدول العملاء برتبة 'provider'
        const { data: newPart, error } = await _supabase
            .from('clients')
            .insert([{
                name,
                phone,
                email,
                password,
                role: 'provider',
                exchange_rate: 220,
                campaign_keyword: 'vendor_' + phone
            }])
            .select()
            .single();

        if (error) throw error;

        // 2. تفعيل المحفظة التلقائية له
        await _supabase
            .from('provider_wallets')
            .insert([{
                provider_id: newPart.id,
                total_requests: 0,
                completed_requests: 0,
                rejected_requests: 0,
                total_revenue_usd: 0,
                payout_balance_usd: 0
            }]);

        alert(`تم إنشاء حساب الشريك (${name}) وتفعيل محفظته الإحصائية بنجاح!`);
        closePartnerModal();
        loadPartnersViewData();

    } catch (e) {
        console.error(e);
        alert("حدث خطأ أثناء إنشاء حساب الشريك: " + e.message);
    }
}

// دالة حذف الشريك
async function deletePartnerAccount(providerId, providerName) {
    if (!confirm(`هل أنت متأكد من رغبتك في حذف حساب الشريك الشريك (${providerName})؟\nسيؤدي هذا لحذف المحفظة وكافة بياناته نهائياً.`)) return;

    try {
        const { error } = await _supabase
            .from('clients')
            .delete()
            .eq('id', providerId);

        if (error) throw error;

        alert(`تم حذف حساب الشريك الشريك (${providerName}) بنجاح.`);
        loadPartnersViewData();

    } catch (e) {
        console.error(e);
        alert("فشل حذف الحساب.");
    }
}

async function checkAdminTelegramStatus() {
    const input = document.getElementById('admin-tg-chat-id-input');
    if (!input || !user) return;

    try {
        const { data: adminData, error } = await _supabase
            .from('clients')
            .select('telegram_chat_id')
            .eq('id', user.id)
            .maybeSingle();

        if (error) throw error;

        if (adminData && adminData.telegram_chat_id) {
            input.value = adminData.telegram_chat_id;
            user.telegram_chat_id = adminData.telegram_chat_id;
            localStorage.setItem('currentUser', JSON.stringify(user));
        }
    } catch (e) {
        console.error("Error checking admin telegram status:", e);
    }
}

async function saveAdminTelegramChatId() {
    const input = document.getElementById('admin-tg-chat-id-input');
    if (!input) return;
    const chatId = input.value.trim();

    if (!chatId) {
        alert("يرجى إدخال معرف تليجرام صحيح.");
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

        // إرسال تنبيه تجريبي عبر البوت للأدمن
        try {
            await _supabase.rpc('secure_send_telegram', {
                p_message: "🎉 تم ربط حساب الإدارة في AdVault بنجاح! ستصلك إشعارات وتنبيهات شحن الرصيد والنزاعات هنا فوراً.",
                p_chat_id: chatId
            });
        } catch (_) {}

        alert("تم حفظ معرف التليجرام وإرسال رسالة تأكيد بنجاح! 🏆");
    } catch (e) {
        console.error("Error saving admin telegram chat ID:", e);
        alert("حدث خطأ أثناء حفظ معرف التليجرام.");
    }
}

// ==========================================
//  نظام تنبيهات فوترة فيسبوك وسحب الرصيد على تليجرام
// ==========================================
async function loadFbBillingSettings() {
    const dayInput = document.getElementById('fb-billing-day-input');
    const thresholdInput = document.getElementById('fb-threshold-input');

    const savedDay = localStorage.getItem('fb_billing_day') || '';
    const savedThreshold = localStorage.getItem('fb_billing_threshold') || '292';

    if (dayInput && savedDay) dayInput.value = savedDay;
    if (thresholdInput && savedThreshold) thresholdInput.value = savedThreshold;
}

async function saveFbBillingSettings() {
    const dayInput = document.getElementById('fb-billing-day-input');
    const thresholdInput = document.getElementById('fb-threshold-input');

    const day = dayInput ? dayInput.value.trim() : '';
    const threshold = thresholdInput ? thresholdInput.value.trim() : '292';

    if (day && (parseInt(day) < 1 || parseInt(day) > 31)) {
        alert("يرجى إدخال يوم فوترة شهري صحيح بين 1 و 31.");
        return;
    }

    if (day) localStorage.setItem('fb_billing_day', day);
    if (threshold) localStorage.setItem('fb_billing_threshold', threshold);

    showToast("تم حفظ إعدادات تنبيهات فوترة فيسبوك بنجاح! 💳");
    alert("✅ تم حفظ إعدادات الفوترة بنجاح. سيتولى النظام إرسال التنبيهات تلقائياً عبر تليجرام عند بلوغ 90% أو عند حلول يوم الفوترة.");

    // إعادة فحص الرصيد فوراً
    fetchHeaderBalance();
}

async function testFbBillingAlert() {
    const adminChatId = user?.telegram_chat_id || localStorage.getItem('admin_tg_chat_id');
    if (!adminChatId) {
        alert("⚠️ يرجى ربط وحفظ معرّف التليجرام الخاص بك أولاً في كارت إشعارات التليجرام.");
        return;
    }

    const day = localStorage.getItem('fb_billing_day') || document.getElementById('fb-billing-day-input')?.value || 'غير محدد';
    const threshold = parseFloat(localStorage.getItem('fb_billing_threshold') || document.getElementById('fb-threshold-input')?.value || '292');
    const fbSpendEl = document.getElementById('fb-current-spend');
    const currentSpend = fbSpendEl ? fbSpendEl.innerText : '0.00';

    try {
        const testMsg = `🧪 [فحص تجريبي لنظام تنبيهات فوترة فيسبوك في AdVault]
━━━━━━━━━━━━━━━━━━
✅ نظام التنبيهات المالي يعمل بنجاح ومربوط بحساب الإدارة!

📅 يوم الفوترة المحدد: ${day} من كل شهر
📊 عتبة الفوترة القصوى: $${threshold}
⚠️ عتبة تنبيه الـ 90%: عند تجاوز $${(threshold * 0.9).toFixed(2)}
💳 الاستهلاك الحالي المسجل: $${currentSpend}

🔔 ستصلك التنبيهات التلقائية عند اقتراب سحب فيسبوك للمال أو عند حلول يوم الفوترة لتفادي توقف الإعلانات.`;

        await _supabase.rpc('secure_send_telegram', {
            p_message: testMsg,
            p_chat_id: adminChatId
        });

        alert("🚀 تم إرسال رسالة الفحص التجريبي بنجاح إلى حسابك على تليجرام! تفقد البوت الآن.");
    } catch (e) {
        console.error("Test telegram alert failed:", e);
        alert("❌ تعذر إرسال التنبيه التجريبي عبر تليجرام. تأكد من صحة معرّف Chat ID ومن تشغيل البوت.");
    }
}

async function checkAndSendFacebookBillingAlerts(currentSpend, maxThreshold, percentage) {
    const adminChatId = user?.telegram_chat_id || localStorage.getItem('admin_tg_chat_id');
    if (!adminChatId) return; // لا يوجد تليجرام مسجل للأدمن

    const fbBillingDay = parseInt(localStorage.getItem('fb_billing_day') || document.getElementById('fb-billing-day-input')?.value || '0');
    const todayDate = new Date();
    const todayDay = todayDate.getDate();
    const todayDateStr = todayDate.toISOString().slice(0, 10); // YYYY-MM-DD

    // 1. الحالة الأولى: وصول فيسبوك لليوم الذي يسحب فيه الرصيد (يوم الفوترة المحدد)
    if (fbBillingDay > 0 && todayDay === fbBillingDay) {
        const dayAlertKey = `fb_billing_day_sent_${todayDateStr}`;
        if (!localStorage.getItem(dayAlertKey)) {
            try {
                const dayMsg = `💳 [تنبيه هام: موعد فوترة فيسبوك اليوم!]
━━━━━━━━━━━━━━━━━━
📅 اليوم هو موعد دورة فوترة إعلانات فيسبوك المحددة (يوم ${todayDay} من الشهر).
📊 الاستهلاك الحالي المستحق: $${currentSpend.toFixed(2)} من أصل $${maxThreshold}
⚡ النسبة المستهلكة: ${percentage.toFixed(1)}%

⚠️ يرجى التأكد من توفر الرصيد الكافي في البطاقة المصرفية لتجنب فشل السحب وتوقف إعلانات الزبائن المفاجئ.`;

                await _supabase.rpc('secure_send_telegram', {
                    p_message: dayMsg,
                    p_chat_id: adminChatId
                });

                localStorage.setItem(dayAlertKey, 'true');
                console.log("✅ تم إرسال تنبيه يوم الفوترة للأدمن عبر تليجرام بنجاح.");
            } catch (err) {
                console.error("فشل إرسال تنبيه يوم الفوترة عبر تليجرام:", err);
            }
        }
    }

    // 2. الحالة الثانية: وصول الاستهلاك إلى 90% أو أكثر من إجمالي العتبة القصوى
    if (percentage >= 90) {
        // مفتاح تنبيه الـ 90% لمنع التكرار المزعج في نفس اليوم لنفس مستوى الصرف
        const spendBucket = Math.floor(currentSpend / 5) * 5; // يتغير كل 5 دولار زيادة
        const thresholdAlertKey = `fb_90_alert_sent_${todayDateStr}_${spendBucket}`;
        
        if (!localStorage.getItem(thresholdAlertKey)) {
            try {
                const remaining = Math.max(0, maxThreshold - currentSpend);
                const alert90Msg = `⚠️ [تحذير عاجل: استهلاك ${percentage.toFixed(1)}% من عتبة فيسبوك!]
━━━━━━━━━━━━━━━━━━
🚨 وصل استهلاك الإعلانات إلى 90%+ من حد الفوترة الإجمالي!
💳 الاستهلاك الحالي: $${currentSpend.toFixed(2)} / $${maxThreshold}
🔋 المتبقي للوصول للعتبة القصوى: $${remaining.toFixed(2)} فقط.

📌 سيقوم فيسبوك بسحب المبلغ من البطاقة قريباً جداً، يرجى شحن البطاقة فوراً لضمان استمرار الحملات النشطة دون توقف.`;

                await _supabase.rpc('secure_send_telegram', {
                    p_message: alert90Msg,
                    p_chat_id: adminChatId
                });

                localStorage.setItem(thresholdAlertKey, 'true');
                console.log("✅ تم إرسال تحذير الـ 90% للأدمن عبر تليجرام بنجاح.");
            } catch (err) {
                console.error("فشل إرسال تحذير الـ 90% عبر تليجرام:", err);
            }
        }
    }
}

async function loadCompanyExpenses() {
    const tbody = document.getElementById('admin-expenses-table-body');
    const badge = document.getElementById('expenses-count-badge');
    if (!tbody) return;

    try {
        const { data, error } = await _supabase
            .from('company_expenses')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        badge.innerText = `${data.length} مصروف`;

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-400 font-bold">لا توجد مصاريف مسجلة حالياً.</td></tr>`;
            updateExpensesCharts([]);
            return;
        }

        tbody.innerHTML = '';
        data.forEach(item => {
            const dateStr = new Date(item.created_at).toLocaleDateString('ar-DZ', { day: 'numeric', month: 'short', year: 'numeric' });
            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-50 transition border-b border-slate-50';
            row.innerHTML = `
                <td class="p-3 font-bold text-gray-800">${item.title}</td>
                <td class="p-3 font-semibold text-gray-500">${item.category}</td>
                <td class="p-3 text-center font-bold text-gray-650">$${parseFloat(item.amount_usd || 0).toFixed(2)}</td>
                <td class="p-3 text-center font-bold text-rose-600">${parseInt(item.amount_dzd || 0).toLocaleString('fr-FR')} دج</td>
                <td class="p-3 text-gray-450">${dateStr}</td>
                <td class="p-3 text-center">
                    <button onclick="deleteCompanyExpense('${item.id}')"
                        class="bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold py-1 px-2.5 rounded-lg cursor-pointer transition">
                        🗑️ حذف
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // استدعاء رسم التحليلات والمنحنيات البيانية
        updateExpensesCharts(data);

    } catch (e) {
        console.error("Error loading expenses:", e);
        tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-red-500 font-bold">حدث خطأ أثناء تحميل المصاريف.</td></tr>`;
    }
}

async function saveCompanyExpense(event) {
    if (event) event.preventDefault();
    const title = document.getElementById('expense-title').value.trim();
    const amountUsd = parseFloat(document.getElementById('expense-amount-usd').value) || 0;
    const amountDzd = parseFloat(document.getElementById('expense-amount-dzd').value) || 0;
    const category = document.getElementById('expense-category').value;
    const notes = document.getElementById('expense-notes').value.trim();
    const submitBtn = document.getElementById('expense-submit-btn');

    if (!title) {
        alert("يرجى إدخال اسم المصروف.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "⏳ جاري الحفظ...";

    try {
        // التحقق من كفاية رصيد خزينة الشركة أولاً
        const { data: vault } = await _supabase
            .from('company_vaults')
            .select('*')
            .eq('id', '00000000-0000-0000-0000-000000000000')
            .maybeSingle();

        if (vault && amountDzd > parseFloat(vault.company_dzd_balance || 0)) {
            alert("⚠️ خطأ حسابي: رصيد خزينة الشركة بالدينار غير كافٍ لدفع هذا المصروف (لا يمكن لخزينة الشركة أن تقل عن الصفر)!");
            submitBtn.disabled = false;
            submitBtn.innerText = "💾 تسجيل المصروف";
            return;
        }

        const { error } = await _supabase
            .from('company_expenses')
            .insert([{
                title,
                amount_usd: amountUsd,
                amount_dzd: amountDzd,
                category,
                notes
            }]);

        if (error) throw error;

        // خصم المصروف من خزينة الشركة وتسجيل العملية في الكشف
        if (vault) {
            await _supabase
                .from('company_vaults')
                .update({
                    company_dzd_balance: parseFloat(vault.company_dzd_balance || 0) - amountDzd,
                    updated_at: new Date().toISOString()
                })
                .eq('id', '00000000-0000-0000-0000-000000000000');

            await _supabase
                .from('vault_ledger')
                .insert([{
                    vault_type: 'company',
                    action_type: 'company_expense',
                    amount_dzd: amountDzd,
                    notes: `مصروف شركة: ${title} (${category})`
                }]);
        }

        showToast("تم تسجيل المصروف وحفظه بنجاح! 💸");
        document.getElementById('expense-form').reset();
        await loadCompanyExpenses();
        await loadSummaryCards();

    } catch (e) {
        console.error("Error saving expense:", e);
        alert("حدث خطأ أثناء حفظ المصروف.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "💾 تسجيل المصروف";
    }
}

async function deleteCompanyExpense(id) {
    if (!confirm("هل أنت متأكد من رغبتك في حذف هذا المصروف نهائياً؟")) return;

    try {
        const { error } = await _supabase
            .from('company_expenses')
            .delete()
            .eq('id', id);

        if (error) throw error;

        showToast("تم حذف المصروف بنجاح.");
        await loadCompanyExpenses();
        await loadSummaryCards();

    } catch (e) {
        console.error("Error deleting expense:", e);
        alert("حدث خطأ أثناء حذف المصروف.");
    }
}

// جعل الدوال متاحة عاماً للنافذة
window.loadPartnersViewData = loadPartnersViewData;
window.openAddPartnerModal = openAddPartnerModal;
window.closePartnerModal = closePartnerModal;
window.saveNewPartner = saveNewPartner;
window.approveService = approveService;
window.rejectService = rejectService;
window.approvePayout = approvePayout;
window.rejectPayout = rejectPayout;
window.closeRejectPayoutModal = closeRejectPayoutModal;
window.submitRejectPayoutForm = submitRejectPayoutForm;
window.deletePartnerAccount = deletePartnerAccount;
window.checkAdminTelegramStatus = checkAdminTelegramStatus;
window.saveAdminTelegramChatId = saveAdminTelegramChatId;
window.loadCompanyExpenses = loadCompanyExpenses;
window.saveCompanyExpense = saveCompanyExpense;
window.deleteCompanyExpense = deleteCompanyExpense;

let expensesComparisonChart = null;
let expensesCategoriesChart = null;

function updateExpensesCharts(expenses) {
    const compCtx = document.getElementById('expenses-comparison-chart')?.getContext('2d');
    const catCtx = document.getElementById('expenses-categories-chart')?.getContext('2d');
    if (!compCtx || !catCtx) return;

    // 1. حساب مصاريف الشهر الحالي والشهر السابق
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    let lastMonth = currentMonth - 1;
    let lastMonthYear = currentYear;
    if (lastMonth < 0) {
        lastMonth = 11;
        lastMonthYear--;
    }

    let thisMonthTotal = 0;
    let lastMonthTotal = 0;

    const categoriesMap = {
        "سيرفرات ودومين": 0,
        "تسويق وإعلانات": 0,
        "عمولات ورواتب": 0,
        "أخرى": 0
    };

    expenses.forEach(e => {
        const date = new Date(e.created_at);
        const m = date.getMonth();
        const y = date.getFullYear();

        if (m === currentMonth && y === currentYear) {
            thisMonthTotal += parseFloat(e.amount_dzd || 0);
            const cat = e.category || 'أخرى';
            if (categoriesMap[cat] !== undefined) {
                categoriesMap[cat] += parseFloat(e.amount_dzd || 0);
            } else {
                categoriesMap["أخرى"] += parseFloat(e.amount_dzd || 0);
            }
        } else if (m === lastMonth && y === lastMonthYear) {
            lastMonthTotal += parseFloat(e.amount_dzd || 0);
        }
    });

    if (expensesComparisonChart) expensesComparisonChart.destroy();
    expensesComparisonChart = new Chart(compCtx, {
        type: 'bar',
        data: {
            labels: ['الشهر الفائت', 'الشهر الحالي'],
            datasets: [{
                label: 'إجمالي المصاريف (دج)',
                data: [lastMonthTotal, thisMonthTotal],
                backgroundColor: ['rgba(244, 63, 94, 0.6)', 'rgba(225, 29, 72, 0.8)'],
                borderColor: ['rgb(244, 63, 94)', 'rgb(225, 29, 72)'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });

    if (expensesCategoriesChart) expensesCategoriesChart.destroy();
    expensesCategoriesChart = new Chart(catCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categoriesMap),
            datasets: [{
                data: Object.values(categoriesMap),
                backgroundColor: [
                    'rgba(59, 130, 246, 0.7)',
                    'rgba(245, 158, 11, 0.7)',
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(107, 114, 128, 0.7)'
                ],
                borderColor: [
                    'rgb(59, 130, 246)',
                    'rgb(245, 158, 11)',
                    'rgb(16, 185, 129)',
                    'rgb(107, 114, 128)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } }
            }
        }
    });
}

async function loadCompanyDebts() {
    const tbody = document.getElementById('admin-debts-table-body');
    if (!tbody) return;

    try {
        const { data: allDebts, error } = await _supabase
            .from('company_debts')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // 1. حساب الإحصائيات (فقط الديون غير المقضية)
        let debtsToPay = 0;
        let debtsToReceive = 0;

        (allDebts || []).forEach(d => {
            if (d.status === 'غير مقضي') {
                if (d.type === 'علي') {
                    debtsToPay += parseFloat(d.amount_dzd || 0);
                } else if (d.type === 'لي') {
                    debtsToReceive += parseFloat(d.amount_dzd || 0);
                }
            }
        });

        const netDebts = debtsToReceive - debtsToPay;

        const fmt = n => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' دج';
        document.getElementById('debts-to-pay-lbl').innerText = fmt(debtsToPay);
        document.getElementById('debts-to-receive-lbl').innerText = fmt(debtsToReceive);
        
        const netEl = document.getElementById('debts-net-lbl');
        netEl.innerText = (netDebts >= 0 ? '+' : '') + fmt(netDebts);
        if (netDebts >= 0) {
            netEl.className = 'text-emerald-700';
        } else {
            netEl.className = 'text-red-750';
        }

        // 2. تصفية الجدول بناء على الخيار المحدد
        const filterVal = document.getElementById('debt-status-filter').value;
        const filteredDebts = (allDebts || []).filter(d => {
            if (filterVal === 'الكل') return true;
            return d.status === filterVal;
        });

        if (filteredDebts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-gray-400 font-bold">لا توجد ديون مطابقة للفلتر المحدد.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        filteredDebts.forEach(item => {
            const dateStr = item.due_date ? new Date(item.due_date).toLocaleDateString('ar-DZ') : '-';
            const typeBadge = item.type === 'علي' 
                ? `<span class="bg-red-50 text-red-655 border border-red-100 px-2 py-0.5 rounded font-black text-[10px]">🔴 عليّ (للغير)</span>`
                : `<span class="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded font-black text-[10px]">🟢 لي (عند الغير)</span>`;
            
            const statusBadge = item.status === 'مقضي'
                ? `<span class="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded font-bold">مقضي ✅</span>`
                : `<span class="bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded font-bold">غير مقضي ⏳</span>`;

            const toggleBtnText = item.status === 'مقضي' ? '🔄 إرجاع كغير مقضي' : '✅ تحديد كمقضي';
            const toggleBtnClass = item.status === 'مقضي'
                ? 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-250';

            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-50 transition border-b border-slate-50';
            row.innerHTML = `
                <td class="p-3 font-bold text-gray-800">${item.person_name}</td>
                <td class="p-3">${typeBadge}</td>
                <td class="p-3 text-center font-bold text-gray-650">$${parseFloat(item.amount_usd || 0).toFixed(2)}</td>
                <td class="p-3 text-center font-bold ${item.type === 'علي' ? 'text-red-600' : 'text-emerald-600'}">${item.type === 'علي' ? '-' : '+'}${parseInt(item.amount_dzd || 0).toLocaleString('fr-FR')} دج</td>
                <td class="p-3 text-gray-450">${dateStr}</td>
                <td class="p-3 text-center">${statusBadge}</td>
                <td class="p-3 text-center flex items-center justify-center gap-1.5">
                    <button onclick="toggleCompanyDebtStatus('${item.id}', '${item.status}')"
                        class="${toggleBtnClass} text-[9px] font-black py-1 px-2 rounded-lg cursor-pointer transition">
                        ${toggleBtnText}
                    </button>
                    <button onclick="deleteCompanyDebt('${item.id}')"
                        class="bg-red-50 hover:bg-red-100 text-red-600 border border-red-150 text-[9px] font-black py-1 px-2 rounded-lg cursor-pointer transition">
                        🗑️ حذف
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

    } catch (e) {
        console.error("Error loading debts:", e);
        tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-red-500 font-bold">حدث خطأ أثناء تحميل سجل الديون.</td></tr>`;
    }
}

async function saveCompanyDebt(event) {
    if (event) event.preventDefault();
    const personName = document.getElementById('debt-person-name').value.trim();
    const type = document.getElementById('debt-type').value;
    const amountUsd = parseFloat(document.getElementById('debt-amount-usd').value) || 0;
    const amountDzd = parseFloat(document.getElementById('debt-amount-dzd').value) || 0;
    const dueDate = document.getElementById('debt-due-date').value || null;
    const notes = document.getElementById('debt-notes').value.trim();
    const submitBtn = document.getElementById('debt-submit-btn');

    if (!personName) {
        alert("يرجى إدخال اسم الطرف الآخر.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "⏳ جاري الحفظ...";

    try {
        const { error } = await _supabase
            .from('company_debts')
            .insert([{
                person_name: personName,
                type,
                amount_usd: amountUsd,
                amount_dzd: amountDzd,
                due_date: dueDate,
                notes
            }]);

        if (error) throw error;

        showToast("تم تسجيل وحفظ الدين بنجاح! 🤝");
        document.getElementById('debt-form').reset();
        await loadCompanyDebts();

    } catch (e) {
        console.error("Error saving debt:", e);
        alert("حدث خطأ أثناء حفظ الدين.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "💾 حفظ الدين";
    }
}

async function toggleCompanyDebtStatus(id, currentStatus) {
    const nextStatus = currentStatus === 'مقضي' ? 'غير مقضي' : 'مقضي';
    try {
        const { error } = await _supabase
            .from('company_debts')
            .update({ status: nextStatus })
            .eq('id', id);

        if (error) throw error;

        showToast(nextStatus === 'مقضي' ? "تم تحديد الدين كمقضي بنجاح! ✅" : "تمت إعادة الدين للحالة غير المقضية.");
        await loadCompanyDebts();

    } catch (e) {
        console.error("Error toggling debt status:", e);
        alert("حدث خطأ أثناء تحديث حالة الدين.");
    }
}

async function deleteCompanyDebt(id) {
    if (!confirm("هل أنت متأكد من رغبتك في حذف هذا السجل نهائياً؟")) return;

    try {
        const { error } = await _supabase
            .from('company_debts')
            .delete()
            .eq('id', id);

        if (error) throw error;

        showToast("تم حذف سجل الدين بنجاح.");
        await loadCompanyDebts();

    } catch (e) {
        console.error("Error deleting debt:", e);
        alert("حدث خطأ أثناء حذف السجل.");
    }
}

window.loadCompanyDebts = loadCompanyDebts;
window.saveCompanyDebt = saveCompanyDebt;
window.toggleCompanyDebtStatus = toggleCompanyDebtStatus;
window.deleteCompanyDebt = deleteCompanyDebt;

// ==========================================
//  إدارة الخزائن الثلاث والسيولة المالية
// ==========================================

let activeVaultRow = null;

function switchVaultForm(formType) {
    const buyForm = document.getElementById('form-vault-buy');
    const fbForm = document.getElementById('form-vault-fb');
    const personalForm = document.getElementById('form-vault-personal');

    const buyBtn = document.getElementById('btn-tab-buy');
    const fbBtn = document.getElementById('btn-tab-fb');
    const personalBtn = document.getElementById('btn-tab-personal');

    // إخفاء الكل
    buyForm.classList.add('hidden');
    fbForm.classList.add('hidden');
    personalForm.classList.add('hidden');

    // إزالة تحديد التابات
    buyBtn.className = "flex-1 pb-2 font-bold border-b-2 border-transparent text-gray-400 transition cursor-pointer";
    fbBtn.className = "flex-1 pb-2 font-bold border-b-2 border-transparent text-gray-400 transition cursor-pointer";
    personalBtn.className = "flex-1 pb-2 font-bold border-b-2 border-transparent text-gray-400 transition cursor-pointer";

    if (formType === 'buy') {
        buyForm.classList.remove('hidden');
        buyBtn.className = "flex-1 pb-2 font-bold border-b-2 border-amber-600 text-amber-700 transition cursor-pointer";
    } else if (formType === 'fb') {
        fbForm.classList.remove('hidden');
        fbBtn.className = "flex-1 pb-2 font-bold border-b-2 border-indigo-600 text-indigo-700 transition cursor-pointer";
    } else if (formType === 'personal') {
        personalForm.classList.remove('hidden');
        personalBtn.className = "flex-1 pb-2 font-bold border-b-2 border-emerald-600 text-emerald-700 transition cursor-pointer";
    }
}

async function loadVaultData() {
    try {
        // 1. جلب أرصدة الخزائن الحالية
        const { data, error } = await _supabase
            .from('company_vaults')
            .select('*')
            .eq('id', '00000000-0000-0000-0000-000000000000')
            .maybeSingle();

        console.log("Vault fetch result:", data, "Error:", error);

        if (error) throw error;
        if (data) {
            activeVaultRow = data;
            document.getElementById('vault-card-usd').innerText = `$${parseFloat(data.card_usd_balance || 0).toFixed(2)}`;
            document.getElementById('vault-company-dzd').innerText = `${parseInt(data.company_dzd_balance || 0).toLocaleString('fr-FR')} دج`;
            document.getElementById('vault-my-dzd').innerText = `${parseInt(data.my_dzd_balance || 0).toLocaleString('fr-FR')} دج`;
        } else {
            console.warn("⚠️ لم يتم استرجاع أي بيانات للخزينة. قد يكون هذا بسبب عدم تطابق توكن الجلسة (جرب تسجيل الخروج ثم الدخول مجدداً لتحديث التوكن).");
        }

        // 2. جلب سجل المعاملات التاريخي
        const { data: ledger, error: ledgerErr } = await _supabase
            .from('vault_ledger')
            .select('*')
            .order('created_at', { ascending: false });

        if (ledgerErr) throw ledgerErr;

        const tbody = document.getElementById('vault-ledger-table-body');
        if (tbody) {
            if (!ledger || ledger.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-gray-400 font-bold">لا توجد حركات مسجلة بالخزينة حالياً.</td></tr>`;
                return;
            }

            tbody.innerHTML = '';
            ledger.forEach(item => {
                const dateStr = new Date(item.created_at).toLocaleDateString('ar-DZ', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                let vaultName = '';
                if (item.vault_type === 'card') vaultName = '💳 البطاقة (USD)';
                else if (item.vault_type === 'company') vaultName = '🏦 الشركة (DZD)';
                else if (item.vault_type === 'personal') vaultName = '👤 شخصي (DZD)';

                let actionName = '';
                if (item.action_type === 'buy_usd') actionName = '💵 شراء دولار';
                else if (item.action_type === 'fb_spend') actionName = '📉 استهلاك فيس';
                else if (item.action_type === 'company_expense') actionName = '💸 مصروف شركة';
                else if (item.action_type === 'recharge_income') actionName = '📥 مداخيل زبون';
                else if (item.action_type === 'personal_withdraw') actionName = '🚪 سحب فائدة';
                else if (item.action_type === 'personal_deposit') actionName = '📥 إرجاع أموال';

                const row = document.createElement('tr');
                row.className = 'hover:bg-slate-50 border-b border-slate-50 transition';
                row.innerHTML = `
                    <td class="p-3 text-gray-500 text-[10px] font-semibold">${dateStr}</td>
                    <td class="p-3 font-bold text-gray-700">${vaultName}</td>
                    <td class="p-3 text-center font-bold text-indigo-700">${actionName}</td>
                    <td class="p-3 text-center font-bold text-gray-800">${item.amount_dzd > 0 ? parseInt(item.amount_dzd).toLocaleString('fr-FR') + ' دج' : '-'}</td>
                    <td class="p-3 text-center font-bold text-blue-700">${item.amount_usd > 0 ? '$' + parseFloat(item.amount_usd).toFixed(2) : '-'}</td>
                    <td class="p-3 text-center font-mono text-gray-500">${item.exchange_rate > 0 ? item.exchange_rate + ' دج' : '-'}</td>
                    <td class="p-3 text-gray-500 text-[10px] truncate max-w-[150px]">${item.notes || '-'}</td>
                `;
                tbody.appendChild(row);
            });
        }

    } catch (e) {
        console.error("Failed to load vault data:", e);
    }
}

async function executeBuyUsd(event) {
    if (event) event.preventDefault();
    const usdAmount = parseFloat(document.getElementById('vault-buy-usd-amount').value);
    const rate = parseFloat(document.getElementById('vault-buy-exchange-rate').value);
    const notes = document.getElementById('vault-buy-notes').value.trim();

    if (isNaN(usdAmount) || usdAmount <= 0 || isNaN(rate) || rate <= 0) {
        alert("يرجى إدخال قيم صحيحة.");
        return;
    }

    const costDzd = usdAmount * rate;
    const currentCompanyBal = activeVaultRow ? parseFloat(activeVaultRow.company_dzd_balance || 0) : 0;

    if (costDzd > currentCompanyBal) {
        alert("⚠️ خطأ حسابي: رصيد خزينة الشركة بالدينار غير كافٍ لشراء هذا المبلغ من الدولار (لا يمكن للخزينة أن تقل عن الصفر)!");
        return;
    }

    const submitBtn = document.getElementById('vault-buy-submit-btn');
    submitBtn.disabled = true;

    try {
        // 1. تحديث الأرصدة بقاعدة البيانات
        const newCompanyBal = currentCompanyBal - costDzd;
        const newCardBal = (activeVaultRow ? parseFloat(activeVaultRow.card_usd_balance || 0) : 0) + usdAmount;

        const { error } = await _supabase
            .from('company_vaults')
            .update({
                company_dzd_balance: newCompanyBal,
                card_usd_balance: newCardBal,
                updated_at: new Date().toISOString()
            })
            .eq('id', '00000000-0000-0000-0000-000000000000');

        if (error) throw error;

        // 2. تسجيل الحركة
        await _supabase
            .from('vault_ledger')
            .insert([{
                vault_type: 'company',
                action_type: 'buy_usd',
                amount_dzd: costDzd,
                amount_usd: usdAmount,
                exchange_rate: rate,
                notes: notes || "شراء دولار وتغذية بطاقة الإعلانات"
            }]);

        showToast("تمت عملية الشراء وشحن بطاقة الإعلانات بنجاح! 💳");
        document.getElementById('form-vault-buy').reset();
        await loadVaultData();

    } catch (e) {
        console.error("Error executing Buy USD:", e);
        alert("حدث خطأ أثناء معالجة العملية.");
    } finally {
        submitBtn.disabled = false;
    }
}

async function executeFbSpend(event) {
    if (event) event.preventDefault();
    const usdAmount = parseFloat(document.getElementById('vault-fb-amount').value);
    const notes = document.getElementById('vault-fb-notes').value.trim();

    if (isNaN(usdAmount) || usdAmount <= 0) {
        alert("يرجى إدخال مبلغ صحيح.");
        return;
    }

    const currentCardBal = activeVaultRow ? parseFloat(activeVaultRow.card_usd_balance || 0) : 0;

    if (usdAmount > currentCardBal) {
        alert("⚠️ خطأ حسابي: رصيد البطاقة بالدولار لا يكفي لتغطية هذا السحب (غير منطقي أن يقل رصيد البطاقة عن الصفر)!");
        return;
    }

    const submitBtn = document.getElementById('vault-fb-submit-btn');
    submitBtn.disabled = true;

    try {
        // 1. تحديث رصيد البطاقة
        const newCardBal = currentCardBal - usdAmount;

        const { error } = await _supabase
            .from('company_vaults')
            .update({
                card_usd_balance: newCardBal,
                updated_at: new Date().toISOString()
            })
            .eq('id', '00000000-0000-0000-0000-000000000000');

        if (error) throw error;

        // 2. تسجيل الحركة في الكشف
        await _supabase
            .from('vault_ledger')
            .insert([{
                vault_type: 'card',
                action_type: 'fb_spend',
                amount_usd: usdAmount,
                notes: notes || "سحب واستهلاك إعلانات فيسبوك"
            }]);

        showToast("تم تسجيل خصم استهلاك فيسبوك من رصيد البطاقة بنجاح! 📉");
        document.getElementById('form-vault-fb').reset();
        await loadVaultData();

    } catch (e) {
        console.error("Error executing FB spend:", e);
        alert("حدث خطأ أثناء معالجة العملية.");
    } finally {
        submitBtn.disabled = false;
    }
}

async function executePersonalVaultAction(event) {
    if (event) event.preventDefault();
    const action = document.getElementById('vault-personal-action').value;
    const amountDzd = parseInt(document.getElementById('vault-personal-amount').value);
    const notes = document.getElementById('vault-personal-notes').value.trim();

    if (isNaN(amountDzd) || amountDzd <= 0) {
        alert("يرجى إدخال مبلغ صحيح بالدينار.");
        return;
    }

    const currentPersonalBal = activeVaultRow ? parseFloat(activeVaultRow.my_dzd_balance || 0) : 0;

    if (action === 'withdraw' && amountDzd > currentPersonalBal) {
        alert("⚠️ خطأ حسابي: رصيدك الشخصي الحالي غير كافٍ لسحب هذا المبلغ!");
        return;
    }

    const submitBtn = document.getElementById('vault-personal-submit-btn');
    submitBtn.disabled = true;

    try {
        // 1. حساب الرصيد الجديد
        const newPersonalBal = action === 'withdraw' ? currentPersonalBal - amountDzd : currentPersonalBal + amountDzd;

        const { error } = await _supabase
            .from('company_vaults')
            .update({
                my_dzd_balance: newPersonalBal,
                updated_at: new Date().toISOString()
            })
            .eq('id', '00000000-0000-0000-0000-000000000000');

        if (error) throw error;

        // 2. تسجيل الحركة
        await _supabase
            .from('vault_ledger')
            .insert([{
                vault_type: 'personal',
                action_type: action === 'withdraw' ? 'personal_withdraw' : 'personal_deposit',
                amount_dzd: amountDzd,
                notes: notes || (action === 'withdraw' ? "سحب أرباح الأدمن الشخصية" : "إيداع/إرجاع أموال للخزينة الشخصية")
            }]);

        showToast(action === 'withdraw' ? "تم تسجيل سحب الأرباح الشخصية بنجاح! 🚪" : "تم تسجيل إرجاع الأموال بنجاح! 📥");
        document.getElementById('form-vault-personal').reset();
        await loadVaultData();

    } catch (e) {
        console.error("Error executing personal vault action:", e);
        alert("حدث خطأ أثناء معالجة العملية.");
    } finally {
        submitBtn.disabled = false;
    }
}

// جعل الوظائف متاحة عالمياً
window.switchVaultForm = switchVaultForm;
window.loadVaultData = loadVaultData;
window.executeBuyUsd = executeBuyUsd;
window.executeFbSpend = executeFbSpend;
window.executePersonalVaultAction = executePersonalVaultAction;

// ==========================================
//  تصدير كشف الخزينة كملف CSV
// ==========================================
async function exportVaultLedgerToCSV() {
    try {
        const { data, error } = await _supabase
            .from('vault_ledger')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        if (!data || data.length === 0) {
            alert("لا توجد أي حركات مالية في كشف الخزينة لتصديرها.");
            return;
        }

        // بناء صفوف الـ CSV
        const headers = ["التاريخ", "الخزينة", "العملية", "القيمة بالدينار", "القيمة بالدولار", "سعر الصرف", "ملاحظات"];
        let csvContent = "\uFEFF"; // إضافة BOM لدعم اللغة العربية في إكسل
        csvContent += headers.join(",") + "\n";

        data.forEach(item => {
            const dateStr = new Date(item.created_at).toLocaleString('ar-DZ').replace(/,/g, ' ');
            
            let vaultName = '';
            if (item.vault_type === 'card') vaultName = 'البطاقة (USD)';
            else if (item.vault_type === 'company') vaultName = 'الشركة (DZD)';
            else if (item.vault_type === 'personal') vaultName = 'شخصي (DZD)';

            let actionName = '';
            if (item.action_type === 'buy_usd') actionName = 'شراء دولار';
            else if (item.action_type === 'fb_spend') actionName = 'استهلاك فيس';
            else if (item.action_type === 'company_expense') actionName = 'مصروف شركة';
            else if (item.action_type === 'recharge_income') actionName = 'مداخيل زبون';
            else if (item.action_type === 'personal_withdraw') actionName = 'سحب فائدة';
            else if (item.action_type === 'personal_deposit') actionName = 'إرجاع أموال';

            const dzdVal = item.amount_dzd || 0;
            const usdVal = item.amount_usd || 0;
            const rateVal = item.exchange_rate || 0;
            const noteStr = (item.notes || '-').replace(/,/g, ' ');

            const row = [
                `"${dateStr}"`,
                `"${vaultName}"`,
                `"${actionName}"`,
                dzdVal,
                usdVal,
                rateVal,
                `"${noteStr}"`
            ];
            csvContent += row.join(",") + "\n";
        });

        // تنزيل الملف
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Vault_Ledger_Export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast("تم تصدير كشف حركات الخزينة كملف CSV بنجاح! 📥");

    } catch (e) {
        console.error("Export failed:", e);
        alert("فشل تصدير كشف الحركات.");
    }
}
window.exportVaultLedgerToCSV = exportVaultLedgerToCSV;

// ==========================================
//  نظام إدارة تذاكر الدعم الفني للأدمن (Support Tickets)
// ==========================================
async function loadAdminTickets() {
    const tableBody = document.getElementById('admin-tickets-table-body');
    if (!tableBody) return;

    try {
        const { data: tickets, error } = await _supabase
            .from('support_tickets')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!tickets || tickets.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-400 font-bold">لا توجد تذاكر دعم فني مفتوحة حالياً.</td></tr>`;
            return;
        }

        // جلب أسماء الزبائن لعرضها بالتذكرة
        const { data: clients } = await _supabase
            .from('clients')
            .select('id, name');

        tableBody.innerHTML = '';
        tickets.forEach(t => {
            const client = (clients || []).find(c => c.id === t.client_id);
            const clientName = client ? client.name : 'زبون غير معروف';
            const dateStr = new Date(t.created_at).toLocaleDateString('ar-DZ', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });

            let statusBadge = '';
            if (t.status === 'open') {
                statusBadge = '<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-bold">مفتوحة</span>';
            } else if (t.status === 'in_progress') {
                statusBadge = '<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-bold">قيد المعالجة</span>';
            } else if (t.status === 'resolved') {
                statusBadge = '<span class="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded text-[10px] font-bold">تم الحل ✅</span>';
            }

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition border-b border-gray-100';

            const escapedDesc = (t.description || '').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
            const escapedReply = (t.admin_reply || '').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');

            tr.innerHTML = `
                <td class="p-3 font-bold text-indigo-750">${clientName}</td>
                <td class="p-3 font-bold text-gray-800">${t.title}</td>
                <td class="p-3 font-semibold text-gray-500">${t.category}</td>
                <td class="p-3 text-center">${statusBadge}</td>
                <td class="p-3 text-center text-gray-405">${dateStr}</td>
                <td class="p-3 text-left">
                    <button onclick="openReplyTicketModal('${t.id}', '${escapedDesc}', '${escapedReply}')"
                        class="bg-indigo-50 hover:bg-indigo-100 text-indigo-650 font-bold py-1 px-2.5 rounded-lg text-[10px] transition cursor-pointer">
                        💬 الرد والحل
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

    } catch (e) {
        console.error("Error loading admin tickets:", e);
    }
}

function openReplyTicketModal(id, desc, reply) {
    document.getElementById('reply-ticket-id').value = id;
    document.getElementById('reply-ticket-desc').innerText = desc;
    document.getElementById('reply-ticket-text').value = reply && reply !== 'null' ? reply : '';
    document.getElementById('reply-ticket-modal').classList.remove('hidden');
}

function closeReplyTicketModal() {
    document.getElementById('reply-ticket-modal').classList.add('hidden');
}

async function submitAdminTicketReply(event) {
    if (event) event.preventDefault();
    const id = document.getElementById('reply-ticket-id').value;
    const replyText = document.getElementById('reply-ticket-text').value.trim();
    const status = document.getElementById('reply-ticket-status').value;
    const submitBtn = document.getElementById('reply-ticket-submit-btn');

    if (!replyText) {
        alert("يرجى كتابة الرد للزبون أولاً.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "⏳ جاري الإرسال...";

    try {
        const { error } = await _supabase
            .from('support_tickets')
            .update({
                admin_reply: replyText,
                status: status,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw error;

        // إخطار الزبون عبر التليجرام إذا كان رابط التليجرام مفعّلاً
        try {
            const { data: ticket } = await _supabase
                .from('support_tickets')
                .select('client_id, title')
                .eq('id', id)
                .single();

            if (ticket) {
                const { data: client } = await _supabase
                    .from('clients')
                    .select('telegram_chat_id')
                    .eq('id', ticket.client_id)
                    .single();

                if (client && client.telegram_chat_id) {
                    const statusLabel = status === 'resolved' ? "تم الحل 🟢" : "قيد المعالجة 🟡";
                    const alertMsg = `🛠️ رد جديد على تذكرة الدعم الفني الخاصة بك:
📌 العنوان: ${ticket.title}
⚙️ الحالة الجديدة: ${statusLabel}
📝 الرد: ${replyText}`;
                    
                    await _supabase.rpc('secure_send_telegram', {
                        p_message: alertMsg,
                        p_chat_id: client.telegram_chat_id
                    });
                }
            }
        } catch (_) {}

        showToast("تم إرسال الرد وحفظ الحالة بنجاح! 🛠️");
        closeReplyTicketModal();
        await loadAdminTickets();

    } catch (e) {
        console.error("Error replying to ticket:", e);
        alert("حدث خطأ أثناء إرسال الرد.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "💾 إرسال الرد وتحديث الحالة";
    }
}

window.loadAdminTickets = loadAdminTickets;
window.openReplyTicketModal = openReplyTicketModal;
window.closeReplyTicketModal = closeReplyTicketModal;
window.submitAdminTicketReply = submitAdminTicketReply;
window.loadFbBillingSettings = loadFbBillingSettings;
window.saveFbBillingSettings = saveFbBillingSettings;
window.testFbBillingAlert = testFbBillingAlert;
window.checkAndSendFacebookBillingAlerts = checkAndSendFacebookBillingAlerts;