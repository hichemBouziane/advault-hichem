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

// المتغير العالمي للاحتفاظ بجميع السجلات بعد جلبها أول مرة
window.allLogs = [];

async function loadGlobalAnalytics() {
    try {
        let { data: logs, error } = await _supabase
            .from('user_logs')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        window.allLogs = logs || [];
        
        // عرض السجلات وتحديث البطاقات تلقائياً بالكل بشكل افتراضي
        renderFilteredLogs(window.allLogs);

    } catch (e) {
        console.error("❌ خطأ أثناء تحميل تحاليل الأدمين:", e.message);
    }
}

function renderFilteredLogs(logs) {
    const totalVisitsEl   = document.getElementById('total-visits');
    const peakHourEl      = document.getElementById('peak-hour');
    const activeClientEl  = document.getElementById('most-active-client');
    const tbody           = document.getElementById('analytics-table-body');

    if (!logs || logs.length === 0) {
        totalVisitsEl.innerText = "0";
        activeClientEl.innerText = "—";
        peakHourEl.innerText = "—";
        tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-gray-400">لا توجد بيانات زيارات مسجلة لهذه الفترة.</td></tr>';
        updateVisitsCharts(Array(24).fill(0), Array(7).fill(0));
        return;
    }

    totalVisitsEl.innerText = logs.length;

    let clientCounts = {};
    let hourCounts   = {};
    
    const hourlyCounts = Array(24).fill(0);
    const weeklyCounts = Array(7).fill(0);

    tbody.innerHTML = '';

    logs.forEach(log => {
        clientCounts[log.user_name] = (clientCounts[log.user_name] || 0) + 1;

        const logDate = new Date(log.created_at);
        const hour    = logDate.getHours();
        const day     = logDate.getDay(); // 0: Sunday, 1: Monday, ...
        
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        hourlyCounts[hour]++;
        weeklyCounts[day]++;

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
    
    // تحديث المخططات
    updateVisitsCharts(hourlyCounts, weeklyCounts);
}

function filterLogsByTime() {
    const filterType = document.getElementById('time-filter').value;
    const now = new Date();
    
    let filtered = window.allLogs || [];
    
    if (filterType === 'today') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        filtered = window.allLogs.filter(log => new Date(log.created_at) >= startOfToday);
    } else if (filterType === 'week') {
        // آخر 7 أيام
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        filtered = window.allLogs.filter(log => new Date(log.created_at) >= startOfWeek);
    } else if (filterType === 'month') {
        // هذا الشهر التقويمي
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        filtered = window.allLogs.filter(log => new Date(log.created_at) >= startOfMonth);
    }
    
    renderFilteredLogs(filtered);
}

// ==========================================
//  رسم وتحديث مخططات نشاط الزيارات
// ==========================================
let hourlyVisitsChartInstance = null;
let weeklyVisitsChartInstance = null;

function updateVisitsCharts(hourlyCounts, weeklyCounts) {
    try {
        // 1. مخطط زيارات الساعات (خطي)
        const hourlyCtx = document.getElementById('hourlyVisitsChart').getContext('2d');
        const hoursLabels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);
        
        if (hourlyVisitsChartInstance) {
            hourlyVisitsChartInstance.data.datasets[0].data = hourlyCounts;
            hourlyVisitsChartInstance.update();
        } else {
            hourlyVisitsChartInstance = new Chart(hourlyCtx, {
                type: 'line',
                data: {
                    labels: hoursLabels,
                    datasets: [{
                        label: 'عدد الزيارات',
                        data: hourlyCounts,
                        borderColor: 'rgb(99, 102, 241)',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        borderWidth: 2.5,
                        tension: 0.35,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: { beginAtZero: true, ticks: { precision: 0 } }
                    }
                }
            });
        }

        // 2. مخطط زيارات الأيام (شريطي)
        const weeklyCtx = document.getElementById('weeklyVisitsChart').getContext('2d');
        const daysLabels = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        
        if (weeklyVisitsChartInstance) {
            weeklyVisitsChartInstance.data.datasets[0].data = weeklyCounts;
            weeklyVisitsChartInstance.update();
        } else {
            weeklyVisitsChartInstance = new Chart(weeklyCtx, {
                type: 'bar',
                data: {
                    labels: daysLabels,
                    datasets: [{
                        label: 'عدد الزيارات',
                        data: weeklyCounts,
                        backgroundColor: 'rgba(16, 185, 129, 0.6)',
                        borderColor: 'rgb(16, 185, 129)',
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
                        y: { beginAtZero: true, ticks: { precision: 0 } }
                    }
                }
            });
        }
    } catch (e) {
        console.error("خطأ أثناء رسم مخططات الزيارات:", e);
    }
}