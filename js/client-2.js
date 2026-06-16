const SUPABASE_URL = "https://uljdazwcjxogpymvbflq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DGoBEde67ewtWtMlC4Nx9w_cuvSAmUc";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CLEAN_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRHi9J9axOomtAw1vM9Y2VE_vHkOPwO77R2MDBiKKJfC3yXynHjBTaUzO1hFs3AEeZTmhEu9gBwHDDq/pub?gid=1473599105&single=true&output=csv";

// التحقق من تسجيل الدخول
const user = JSON.parse(localStorage.getItem('currentUser'));
if (!user || user.role !== 'client') {
    window.location.href = 'index.html';
}

// تعيين اسم المستخدم
document.getElementById('user-welcome').innerText = `مرحباً، ${user.name}`;












// جلب بيانات الحملات من Google Sheets
async function fetchMetaCampaignsSpend() {
    try {
        const response = await fetch(CLEAN_SHEET_URL, { cache: "no-store" });
        if (!response.ok) throw new Error("فشل الاتصال");

        const rawText = await response.text();
        const lines = rawText.split('\n');
        const campaigns = [];

        for (let i = 1; i < lines.length; i++) {
            const currentLine = lines[i].trim();
            if (!currentLine) continue;

            const columns = currentLine.split(',');
            const campaignName = columns[0]?.replace(/["']/g, '').trim();
            const spendValue = parseFloat(columns[1]?.replace(/["']/g, '').trim()) || 0;

            if (campaignName) {
                campaigns.push({
                    name: campaignName,
                    insights: { data: [{ spend: spendValue }] }
                });
            }
        }
        return campaigns;
    } catch (e) {
        console.error("خطأ في جلب Google Sheets:", e.message);
        return [];
    }
}

// تحميل بيانات الزبون
async function loadClientData(client) {
    const metaCampaigns = await fetchMetaCampaignsSpend();

    // حساب المصاريف حسب الكلمة المفتاحية
    let totalSpendEuro = 0;
    metaCampaigns.forEach(camp => {
        if (camp.name.toLowerCase().includes(client.campaign_keyword.toLowerCase())) {
            if (camp.insights?.data?.[0]) {
                totalSpendEuro += parseFloat(camp.insights.data[0].spend || 0);
            }
        }
    });

    // ضرب المصاريف في 1.2 (فائدة الوكالة)
    const totalSpendWithProfit = totalSpendEuro * FINANCIAL_CONFIG.fbFeeMultiplier;

    // جلب المدفوعات من Supabase
    let { data: payments } = await _supabase
        .from('payments')
        .select('*')
        .eq('client_id', client.id)
        .order('date', { ascending: false });

    let totalPaidEuro = payments?.reduce((sum, item) => sum + parseFloat(item.amount_euro || 0), 0) || 0;

    // حساب المستحق بالدينار
    let remainingEuro = totalSpendWithProfit - totalPaidEuro;
    let finalDebtDzd = Math.round(remainingEuro * (client.exchange_rate || 240));

    // تحديث البطاقات
    document.getElementById('client-total-ads').innerText = `${totalSpendWithProfit.toFixed(2)} €`;
    document.getElementById('client-total-paid').innerText = `${totalPaidEuro.toFixed(2)} €`;
    document.getElementById('client-balance').innerText = `${finalDebtDzd.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} دج`;

    // تحديث جدول المدفوعات
    const tbody = document.getElementById('client-payments-table');
    tbody.innerHTML = '';

    if (!payments || payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-400">لا توجد مدفوعات مسجلة بعد</td></tr>';
        return;
    }

    payments.forEach(p => {
        tbody.innerHTML += `
            <tr>
                <td class="p-3">${p.date}</td>
                <td class="p-3 text-emerald-600 font-medium">${parseFloat(p.amount_euro).toFixed(2)} €</td>
                <td class="p-3">${parseFloat(p.amount_dzd).toLocaleString('fr-FR')} دج</td>
                <td class="p-3 text-gray-500">${p.note || '-'}</td>
            </tr>`;
    });
}

function handleLogout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

// تشغيل عند فتح الصفحة
loadClientData(user);
