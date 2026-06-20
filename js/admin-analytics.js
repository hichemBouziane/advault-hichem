const SUPABASE_URL = "https://uljdazwcjxogpymvbflq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DGoBEde67ewtWtMlC4Nx9w_cuvSAmUc"; // نفس المفتاح الخاص بك
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// التأكد من أن الداخل هو الأدمن (يمكنك تعديل الشرط حسب نظام الـ Roles عندك)
const currentAdmin = JSON.parse(localStorage.getItem('currentUser'));
if (!currentAdmin || currentAdmin.role !== 'admin') {
    window.location.href = 'index.html'; 
}

// تشغيل جلب التحاليل عند تحميل الصفحة
document.addEventListener("DOMContentLoaded", () => {
    loadGlobalAnalytics();
});

async function loadGlobalAnalytics() {
    try {
        // 1. جلب كامل السجلات من جدول user_logs
        let { data: logs, error } = await _supabase
            .from('user_logs')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // استهداف عناصر الواجهة لتحديثها
        const totalVisitsEl = document.getElementById('total-visits');
        const peakHourEl = document.getElementById('peak-hour');
        const activeClientEl = document.getElementById('most-active-client');
        const tbody = document.getElementById('analytics-table-body');

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-400">لا توجد بيانات زيارات مسجلة بعد.</td></tr>';
            return;
        }

        // تحديث إجمالي الزيارات بالعداد
        totalVisitsEl.innerText = logs.length;

        // 2. معالجة البيانات للتحاليل (Analytics Processing)
        let clientCounts = {};  // لحساب نشاط كل زبون
        let hourCounts = {};    // لحساب ساعات الذروة
        let weekdayCounts = {}; // للتحليل الأسبوعي
        
        tbody.innerHTML = '';

        logs.forEach(log => {
            // أ) حساب نشاط الزبائن
            clientCounts[log.user_name] = (clientCounts[log.user_name] || 0) + 1;

            // ب) حساب ساعات الذروة
            const logDate = new Date(log.created_at);
            const hour = logDate.getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;

            // ج) تنسيق الوقت للعرض في الجدول
            const formattedTime = logDate.toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

            // د) ملء جدول السجلات الحية
            tbody.innerHTML += `
                <tr class="border-b hover:bg-gray-50 transition text-sm">
                    <td class="p-3 font-bold text-gray-700">${log.user_name}</td>
                    <td class="p-3 text-indigo-600 font-semibold">${log.action}</td>
                    <td class="p-3 text-gray-500 dir-ltr text-right">${formattedTime}</td>
                    <td class="p-3 text-xs text-gray-400 truncate max-w-xs">${log.page_url || '-'}</td>
                </tr>
            `;
        });

        // 3. استخراج العميل الأكثر نشاطاً
        const mostActiveClient = Object.keys(clientCounts).reduce((a, b) => clientCounts[a] > clientCounts[b] ? a : b);
        activeClientEl.innerText = `${mostActiveClient} (${clientCounts[mostActiveClient]} زيارة)`;

        // 4. استخراج ساعة الذروة في الدخول
        const peakHour = Object.keys(hourCounts).reduce((a, b) => hourCounts[a] > hourCounts[b] ? a : b);
        peakHourEl.innerText = `الساعة ${peakHour}:00`;

    } catch (e) {
        console.error("❌ خطأ أثناء تحميل تحاليل الأدمين:", e.message);
    }
}