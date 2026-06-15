// ✅ بيانات Supabase الصحيحة
const SUPABASE_URL = "https://uljdazwcjxogpymvbflq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DGoBEde67ewtWtMlC4Nx9w_cuvSAmUc";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// حساب نطاق التواريخ بناءً على الفلتر المختار
function getDateRange(filterType) {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    switch (filterType) {
        case 'today':
            break;
        case 'yesterday':
            start.setDate(now.getDate() - 1);
            end.setDate(now.getDate() - 1);
            end.setHours(23, 59, 59, 999);
            break;
        case '7days':
            start.setDate(now.getDate() - 6);
            break;
        case '30days':
            start.setDate(now.getDate() - 29);
            break;
        case 'this_month':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'last_month':
            start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            break;
        case 'this_year':
            start = new Date(now.getFullYear(), 0, 1);
            break;
        case 'all':
            return { start: null, end: null };
    }

    return {
        start: start.toISOString(),
        end: end.toISOString()
    };
}

// جلب البيانات وتحديث الواجهة
async function loadAnalyticsData() {
    const filterValue = document.getElementById('date-filter').value;
    const { start, end } = getDateRange(filterValue);

    const tbody = document.getElementById('analytics-table-body');
    const noDataMsg = document.getElementById('no-data-msg');

    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-gray-500 font-medium">🔄 جاري حساب البيانات والتقارير المالية...</td></tr>`;

    let query = _supabase.from('profits_archive').select('*');

    if (start && end) {
        query = query.gte('created_at', start).lte('created_at', end);
    }

    const { data: records, error } = await query.order('created_at', { ascending: false });

    if (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-red-500 font-bold">❌ حدث خطأ أثناء جلب تقارير الأرشيف.</td></tr>`;
        return;
    }

    if (!records || records.length === 0) {
        tbody.innerHTML = '';
        noDataMsg.classList.remove('hidden');
        updateStatCards(0, 0, 0, 0);
        return;
    }

    noDataMsg.classList.add('hidden');
    tbody.innerHTML = '';

    let totalReceived = 0;
    let totalCapital = 0;
    let totalCompany = 0;
    let totalMyProfit = 0;

    records.forEach(rec => {
        totalReceived += parseFloat(rec.amount_received || 0);
        totalCapital += parseFloat(rec.ad_capital || 0);
        totalCompany += parseFloat(rec.company_profit || 0);
        totalMyProfit += parseFloat(rec.my_profit || 0);

        const formattedDate = new Date(rec.created_at).toLocaleDateString('ar-DZ', {
            year: 'numeric', month: 'short', day: 'numeric'
        });

        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition border-b border-gray-100";
        tr.innerHTML = `
            <td class="px-6 py-4 font-medium text-gray-500">${formattedDate}</td>
            <td class="px-6 py-4 font-bold text-gray-800">${rec.client_name}</td>
            <td class="px-6 py-4 font-bold text-gray-700">${parseFloat(rec.amount_received).toLocaleString('fr-FR')} دج</td>
            <td class="px-6 py-4 text-blue-600 font-semibold">${parseFloat(rec.ad_capital).toLocaleString('fr-FR')} دج</td>
            <td class="px-6 py-4 text-purple-600 font-semibold">${parseFloat(rec.company_profit).toLocaleString('fr-FR')} دج</td>
            <td class="px-6 py-4 text-emerald-600 font-bold bg-emerald-50/20">${parseFloat(rec.my_profit).toLocaleString('fr-FR')} دج</td>
        `;
        tbody.appendChild(tr);
    });

    updateStatCards(totalReceived, totalCapital, totalCompany, totalMyProfit);
}

// تحديث البطاقات الأربعة
function updateStatCards(received, capital, company, myProfit) {
    document.getElementById('stat-received').innerText = received.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + " دج";
    document.getElementById('stat-capital').innerText = capital.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + " دج";
    document.getElementById('stat-company').innerText = company.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + " دج";
    document.getElementById('stat-my-profit').innerText = myProfit.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + " دج";
}

// تشغيل عند فتح الصفحة
window.onload = function () {
    loadAnalyticsData();
};
