const SUPABASE_URL = "https://uljdazwcjxogpymvbflq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DGoBEde67ewtWtMlC4Nx9w_cuvSAmUc";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function handleLogin() {
    const phone = document.getElementById('login-phone').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const errorElement = document.getElementById('login-error');

    if (!phone || !password) {
        errorElement.innerText = "يرجى ملء جميع الحقول";
        errorElement.classList.remove('hidden');
        return;
    }

    const { data, error } = await _supabase
        .from('clients')
        .select('*')
        .eq('phone', phone)
        .eq('password', password)
        .single();

    if (error || !data) {
        errorElement.innerText = "رقم الهاتف أو كلمة السر غير صحيحة";
        errorElement.classList.remove('hidden');
    } else {
        localStorage.setItem('currentUser', JSON.stringify(data));
        if (data.role === 'admin') {
            window.location.href = 'admin.html';
        } else {
            window.location.href = 'client.html';
        }
    }
}
