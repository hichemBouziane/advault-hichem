// =========================================================================
// 📱 AdVault Mobile App & Smart Notification Engine (PWA + APK Wrapper)
// =========================================================================

(function () {
    // 1. تسجيل الـ Service Worker لتفعيل تطبيق الهاتف والإشعارات
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('service-worker.js')
                .then((reg) => {
                    window._advaultSWReg = reg;
                })
                .catch((err) => console.warn('[AdVault App] SW registration error:', err));
        });
    }

    // 2. التقاط حدث تثبيت التطبيق كـ PWA لمن لم يحمل الـ APK بعد
    let deferredInstallPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        const installBtn = document.getElementById('mobile-install-app-btn');
        if (installBtn) installBtn.classList.remove('hidden');
    });

    // دالة فتح نافذة تثبيت التطبيق أو تحميل APK من Google Drive
    window.triggerAppInstallOrApk = async function () {
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            if (outcome === 'accepted') {
                deferredInstallPrompt = null;
            }
            return;
        }
        // إذا كان رابط Google Drive للـ APK مضبوطاً في الإعدادات أو يفتح نافذة الإرشادات
        const apkDriveUrl = localStorage.getItem('advault_apk_drive_url') || window.ADVAULT_APK_DRIVE_URL;
        if (apkDriveUrl) {
            window.open(apkDriveUrl, '_blank');
        } else {
            showMobileInstallGuideModal();
        }
    };

    // 3. دالة إطلاق إشعار هاتف حقيقي (Native Notification + Sound + Vibration)
    window.triggerNativePhoneNotification = async function (title, body, url = 'client.html', tag = null) {
        // تشغيل نغمة تنبيه لطيفة
        try {
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.volume = 0.7;
            audio.play().catch(() => {});
        } catch (_) {}

        // اهتزاز الهاتف إن كان مدعوماً
        if ('vibrate' in navigator) {
            try { navigator.vibrate([250, 100, 250]); } catch (_) {}
        }

        // طلب صلاحية الإشعارات إن لم تكن ممنوحة
        if ('Notification' in window && Notification.permission === 'default') {
            try { await Notification.requestPermission(); } catch (_) {}
        }

        // إرسال الإشعار عبر Service Worker ليظهر في شريط إشعارات الأندرويد العلوي
        if ('Notification' in window && Notification.permission === 'granted') {
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'SHOW_NOTIFICATION',
                    title,
                    body,
                    url,
                    tag: tag || 'advault-notif-' + Date.now()
                });
            } else if (window._advaultSWReg && window._advaultSWReg.showNotification) {
                window._advaultSWReg.showNotification(title, {
                    body,
                    icon: 'icons/icon-192.png',
                    badge: 'icons/icon-96.png',
                    dir: 'rtl',
                    lang: 'ar',
                    vibrate: [250, 100, 250]
                });
            } else {
                new Notification(title, { body, icon: 'icons/icon-192.png', dir: 'rtl', lang: 'ar' });
            }
        }

        // إظهار بانر منبثق داخل التطبيق أيضاً (In-App Push Banner) لضمان رؤيته 100%
        showInAppNotificationBanner(title, body);
    };

    // 4. بانر إشعار علوي أنيق يظهر كإشعارات الهواتف الذكية
    function showInAppNotificationBanner(title, body) {
        const existing = document.getElementById('advault-push-banner');
        if (existing) existing.remove();

        const banner = document.createElement('div');
        banner.id = 'advault-push-banner';
        banner.dir = 'rtl';
        banner.className = 'fixed top-4 inset-x-4 max-w-md mx-auto bg-slate-900/95 text-white p-4 rounded-2xl shadow-2xl border border-purple-500/40 z-[9999] flex items-start gap-3 transition-all duration-300 backdrop-blur-md';
        banner.innerHTML = `
            <div class="bg-purple-600/30 border border-purple-400/40 p-2.5 rounded-xl text-xl shrink-0">🔔</div>
            <div class="flex-1 text-right">
                <h4 class="font-black text-sm text-purple-300 mb-0.5">${title}</h4>
                <p class="text-xs text-slate-200 leading-relaxed font-semibold">${body}</p>
            </div>
            <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-white text-xl font-bold leading-none px-1 cursor-pointer">&times;</button>
        `;
        document.body.appendChild(banner);

        setTimeout(() => {
            if (banner && banner.parentElement) {
                banner.style.opacity = '0';
                banner.style.transform = 'translateY(-15px)';
                setTimeout(() => banner.remove(), 300);
            }
        }, 8000);
    }

    // 5. نافذة إرشادات تثبيت التطبيق على الهاتف
    window.showMobileInstallGuideModal = function () {
        const existing = document.getElementById('mobile-install-guide-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'mobile-install-guide-modal';
        modal.dir = 'rtl';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998] flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-3xl max-w-sm w-full p-6 text-right shadow-2xl border border-purple-100 space-y-4">
                <div class="flex items-center justify-between border-b border-gray-100 pb-3">
                    <div class="flex items-center gap-2.5">
                        <img src="icons/icon-72.png" class="w-10 h-10 rounded-xl shadow" alt="AdVault">
                        <div>
                            <h3 class="font-black text-gray-800 text-base">تطبيق AdVault للهاتف</h3>
                            <p class="text-[11px] text-purple-600 font-bold">تثبيت سريع وتنبيهات فورية 🔔</p>
                        </div>
                    </div>
                    <button onclick="document.getElementById('mobile-install-guide-modal').remove()" class="text-gray-400 hover:text-red-500 text-2xl font-bold cursor-pointer">&times;</button>
                </div>

                <div class="space-y-3 text-xs text-gray-600 font-semibold leading-relaxed">
                    <div class="bg-purple-50 border border-purple-100 rounded-2xl p-3.5 text-purple-900">
                        <p class="font-black mb-1">📲 طريقة التثبيت المباشر على هاتفك:</p>
                        <ol class="list-decimal list-inside space-y-1">
                            <li>اضغط على قائمة المتصفح <span class="font-black">(⋮)</span> في الأعلى أو الأسفل.</li>
                            <li>اختر <span class="font-black text-purple-700">"تثبيت التطبيق" (Install App)</span> أو <span class="font-black text-purple-700">"إضافة إلى الشاشة الرئيسية"</span>.</li>
                        </ol>
                    </div>
                    <p class="text-[11px] text-gray-500 text-center">أو اطلب ملف التثبيت المباشر <span class="font-bold text-gray-700">(AdVault.apk)</span> عبر رابط Google Drive من الإدارة.</p>
                </div>

                <div class="flex gap-2 pt-1">
                    <button onclick="enableMobilePushPermission(); document.getElementById('mobile-install-guide-modal').remove();"
                        class="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl text-xs cursor-pointer shadow-md transition">
                        🔔 تفعيل إشعارات الهاتف الآن
                    </button>
                    <button onclick="document.getElementById('mobile-install-guide-modal').remove()"
                        class="bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 px-4 rounded-xl text-xs cursor-pointer transition">
                        إغلاق
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    };

    // 6. تفعيل صلاحية الإشعارات بضغطة زر للعميل أو الأدمن
    window.enableMobilePushPermission = async function () {
        if (!('Notification' in window)) {
            alert('متصفحك الحالي لا يدعم إشعارات الهاتف.');
            return;
        }
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            window.triggerNativePhoneNotification(
                'تم تفعيل إشعارات AdVault بنجاح ✅',
                'ستصلك تنبيهات الرصيد المنخفض والدفعات الجديدة مباشرة على هاتفك.'
            );
            const notifBanner = document.getElementById('client-enable-notif-bar');
            if (notifBanner) notifBanner.classList.add('hidden');
        } else {
            alert('يرجى السماح بالإشعارات من إعدادات المتصفح/التطبيق لتصلك تنبيهات الرصيد.');
        }
    };

    // 7. فحص ذكي وتلقائي لحساب الزبون (الحد الأدنى + تأخر تسديد الدين + إشعارات الأدمن الفورية)
    window.initClientSmartNotifications = async function (client, finalBalanceUsd, exchangeRate) {
        if (!client || !client.id || typeof _supabase === 'undefined') return;

        // أ) إظهار شريط طلب تفعيل الإشعارات إذا لم تكن مفعلة بعد
        if ('Notification' in window && Notification.permission !== 'granted') {
            renderClientEnableNotifBanner();
        }

        const balanceDzd = Math.round(finalBalanceUsd * (exchangeRate || 240));
        const todayKey = new Date().toISOString().split('T')[0];

        // ب) فحص 1: الوصول للحد الأدنى (رصيد منخفض أقل من 10,000 دج أو سالب)
        if (balanceDzd >= 0 && balanceDzd <= 10000) {
            const alertKey = `low_bal_notif_${client.id}_${todayKey}`;
            if (!localStorage.getItem(alertKey)) {
                localStorage.setItem(alertKey, '1');
                window.triggerNativePhoneNotification(
                    '⚠️ تنبيه: رصيدك الإعلاني قارب على النفاد!',
                    `رصيدك المتبقي حالياً هو ${balanceDzd} دج فقط (${finalBalanceUsd.toFixed(2)}$). يرجى شحن حسابك لتفادي توقف حملاتك الإعلانية.`,
                    'client.html',
                    'low-balance-alert'
                );
            }
        }

        // ج) فحص 2: وجود دين مستحق أو الإطالة في عدم الدفع
        if (balanceDzd < -500) {
            const debtDzd = Math.abs(balanceDzd);
            const debtUsd = Math.abs(finalBalanceUsd).toFixed(2);
            const debtAlertKey = `overdue_debt_notif_${client.id}_${todayKey}`;

            if (!localStorage.getItem(debtAlertKey)) {
                localStorage.setItem(debtAlertKey, '1');
                window.triggerNativePhoneNotification(
                    '🔴 تذكير بتسوية المستحقات الإعلانية',
                    `مرحباً ${client.name}، يوجد مبلغ مستحق على حسابكم بقيمة ${debtDzd} دج (${debtUsd}$). يرجى تسوية الرصيد لضمان استمرار الحملات دون انقطاع.`,
                    'client.html',
                    'overdue-debt-alert'
                );
            }
        }

        // د) فحص 3: جلب الإشعارات غير المقروءة المرسلة من الأدمن في قاعدة البيانات
        try {
            const { data: unreadNotifs, error } = await _supabase
                .from('client_notifications')
                .select('*')
                .eq('client_id', client.id)
                .eq('is_read', false)
                .order('created_at', { ascending: false })
                .limit(5);

            if (!error && unreadNotifs && unreadNotifs.length > 0) {
                for (const notif of unreadNotifs) {
                    await window.triggerNativePhoneNotification(
                        notif.title,
                        notif.body,
                        'client.html',
                        'db-notif-' + notif.id
                    );
                    await _supabase
                        .from('client_notifications')
                        .update({ is_read: true })
                        .eq('id', notif.id);
                }
            }
        } catch (err) {
            console.warn('[AdVault App] Notification check skipped:', err.message);
        }

        // هـ) الاستماع اللحظي (Realtime) لأي إشعار جديد يرسله الأدمن أو دفعة جديدة أثناء فتح التطبيق
        try {
            _supabase
                .channel('client-mobile-notifs-' + client.id)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'client_notifications',
                        filter: `client_id=eq.${client.id}`
                    },
                    async (payload) => {
                        const newNotif = payload.new;
                        if (newNotif) {
                            await window.triggerNativePhoneNotification(
                                newNotif.title,
                                newNotif.body,
                                'client.html',
                                'rt-notif-' + newNotif.id
                            );
                            await _supabase
                                .from('client_notifications')
                                .update({ is_read: true })
                                .eq('id', newNotif.id);
                        }
                    }
                )
                .subscribe();
        } catch (_) {}
    };

    function renderClientEnableNotifBanner() {
        if (document.getElementById('client-enable-notif-bar')) return;
        const balanceCard = document.getElementById('balance-card');
        if (!balanceCard) return;

        const bar = document.createElement('div');
        bar.id = 'client-enable-notif-bar';
        bar.className = 'mx-4 mt-3 bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center justify-between gap-2 shadow-xs';
        bar.innerHTML = `
            <div class="flex items-center gap-2 text-right">
                <span class="text-lg">🔔</span>
                <p class="text-xs font-bold text-amber-900">فعّل إشعارات الهاتف لتصلك تنبيهات الرصيد والدفعات فوراً</p>
            </div>
            <button onclick="enableMobilePushPermission()" class="bg-amber-500 hover:bg-amber-600 text-white font-black text-[11px] px-3 py-1.5 rounded-xl shrink-0 cursor-pointer transition shadow-xs">
                تفعيل الآن
            </button>
        `;
        balanceCard.parentNode.insertBefore(bar, balanceCard);
    }
})();
