const SUPABASE_URL = "https://uljdazwcjxogpymvbflq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DGoBEde67ewtWtMlC4Nx9w_cuvSAmUc";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const currentAdmin = JSON.parse(localStorage.getItem('currentUser'));
if (!currentAdmin || currentAdmin.role !== 'admin') {
    window.location.href = 'index.html';
}

document.addEventListener("DOMContentLoaded", () => {
    loadGlobalAnalytics();
});

async function loadGlobalAnalytics() {
    try {
        let { data: logs, error } = await _supabase
            .from('user_logs')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const totalVisitsEl   = document.getElementById('total-visits');
        const peakHourEl      = document.getElementById('peak-hour');
        const activeClientEl  = document.getElementById('most-active-client');
        const tbody           = document.getElementById('analytics-table-body');

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-gray-400">لا توجد بيانات زيارات مسجلة بعد.</td></tr>';
            return;
        }

        totalVisitsEl.innerText = logs.length;

        let clientCounts = {};
        let hourCounts   = {};

        tbody.innerHTML = '';

        logs.forEach(log => {
            clientCounts[log.user_name] = (clientCounts[log.user_name] || 0) + 1;

            const logDate = new Date(log.created_at);
            const hour    = logDate.getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;

            const formattedTime = logDate.toLocaleString('fr-FR', {
                hour: '2-digit', minute: '2-digit',
                day:  '2-digit', month: '2-digit'
            });

            // عرض الموقع — إذا لم يكن موجوداً (سجلات قديمة) نعرض شرطة
            const locationText = log.location || '—';

            tbody.innerHTML += `
                <tr class="border-b hover:bg-gray-50 transition text-sm">
                    <td class="p-3 font-bold text-gray-700">${log.user_name}</td>
                    <td class="p-3 text-indigo-600 font-semibold">${log.action}</td>
                    <td class="p-3 text-gray-500 dir-ltr text-right">${formattedTime}</td>
                    <td class="p-3 text-xs text-gray-400 truncate max-w-xs">${log.page_url || '-'}</td>
                    <td class="p-3 text-xs text-emerald-600 font-semibold whitespace-nowrap">📍 ${locationText}</td>
                </tr>
            `;
        });

        const mostActiveClient = Object.keys(clientCounts).reduce((a, b) => clientCounts[a] > clientCounts[b] ? a : b);
        activeClientEl.innerText = `${mostActiveClient} (${clientCounts[mostActiveClient]} زيارة)`;

        const peakHour = Object.keys(hourCounts).reduce((a, b) => hourCounts[a] > hourCounts[b] ? a : b);
        peakHourEl.innerText = `الساعة ${peakHour}:00`;

    } catch (e) {
        console.error("❌ خطأ أثناء تحميل تحاليل الأدمين:", e.message);
    }
}