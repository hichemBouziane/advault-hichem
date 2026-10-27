const SUPABASE_URL = "https://uljdazwcjxogpymvbflq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DGoBEde67ewtWtMlC4Nx9w_cuvSAmUc";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

async function handleLogin() {
    const phone = document.getElementById('login-phone').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const errorElement = document.getElementById('login-error');

    if (!phone || !password) {
        errorElement.innerText = "يرجى ملء جميع الحقول";
        errorElement.classList.remove('hidden');
        return;
    }

    try {
        const hashedPassword = await hashPassword(password);

        // التحقق الآمن عبر السيرفر دون استرجاع كلمة السر للمتصفح
        const { data, error } = await _supabase.rpc('verify_user_login', {
            p_phone: phone,
            p_password_hash: hashedPassword,
            p_password_plain: password
        });

        if (error || !data || data.length === 0) {
            errorElement.innerText = "رقم الهاتف أو كلمة السر غير صحيحة";
            errorElement.classList.remove('hidden');
            return;
        }

        const loggedUser = data[0];
        localStorage.setItem('currentUser', JSON.stringify(loggedUser));

        if (loggedUser.role === 'admin') {
            window.location.href = 'admin.html';
        } else if (loggedUser.role === 'pending') {
            window.location.href = 'pending.html';
        } else if (loggedUser.role === 'provider') {
            window.location.href = 'provider.html';
        } else {
            window.location.href = 'client.html';
        }
    } catch (e) {
        console.error("Login process error:", e);
        errorElement.innerText = "حدث خطأ أثناء الاتصال بالخادم.";
        errorElement.classList.remove('hidden');
    }
}
