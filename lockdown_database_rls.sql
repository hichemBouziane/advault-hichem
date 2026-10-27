-- 1. إضافة عمود session_token لجدول clients لتخزين جلسات الدخول الآمنة
ALTER TABLE clients ADD COLUMN IF NOT EXISTS session_token UUID DEFAULT gen_random_uuid();

-- توليد توكن لجميع الحسابات الحالية التي لا تملك واحداً
UPDATE clients SET session_token = gen_random_uuid() WHERE session_token IS NULL;


-- 2. تحديث دالة التحقق من الدخول لإرجاع توكن الجلسة (session_token) للمتصفح
DROP FUNCTION IF EXISTS verify_user_login(text,text,text);

CREATE OR REPLACE FUNCTION verify_user_login(
    p_phone TEXT,
    p_password_hash TEXT,
    p_password_plain TEXT
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    phone TEXT,
    email TEXT,
    role TEXT,
    campaign_keyword TEXT,
    exchange_rate INTEGER,
    show_campaigns_table BOOLEAN,
    show_payments_table BOOLEAN,
    telegram_chat_id TEXT,
    redotpay_id TEXT,
    session_token UUID -- أضفنا توكن الجلسة هنا
) AS $$
DECLARE
    v_new_token UUID;
BEGIN
    -- توليد توكن جلسة جديد عند كل تسجيل دخول لزيادة الأمان ومنع الاختراق
    v_new_token := gen_random_uuid();
    
    UPDATE clients 
    SET session_token = v_new_token 
    WHERE phone = p_phone 
      AND (password = p_password_plain OR password = p_password_hash);

    RETURN QUERY
    SELECT 
        c.id, 
        c.name::TEXT, 
        c.phone::TEXT, 
        c.email::TEXT, 
        c.role::TEXT, 
        c.campaign_keyword::TEXT, 
        c.exchange_rate::INTEGER, 
        c.show_campaigns_table::BOOLEAN, 
        c.show_payments_table::BOOLEAN, 
        c.telegram_chat_id::TEXT, 
        c.redotpay_id::TEXT,
        c.session_token::UUID
    FROM clients c
    WHERE c.phone = p_phone 
      AND c.session_token = v_new_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. دوال التحقق من الجلسات عبر الهيدر المخصص (x-session-token)
CREATE OR REPLACE FUNCTION get_user_id_by_session_token(p_token TEXT)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_token IS NULL OR p_token = '' THEN
        RETURN NULL;
    END IF;
    
    SELECT id INTO v_id FROM clients WHERE session_token = p_token::uuid;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin_session(p_token TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF p_token IS NULL OR p_token = '' THEN
        RETURN FALSE;
    END IF;
    
    RETURN EXISTS (
        SELECT 1 FROM clients 
        WHERE session_token = p_token::uuid 
          AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. تفعيل جدار الحماية RLS بالكامل على الجداول وحظر القراءة العلنية للبيانات

-- جدول clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Secure client policy" ON clients;
CREATE POLICY "Secure client policy" ON clients FOR ALL
USING (
    is_admin_session(current_setting('request.headers', true)::json->>'x-session-token')
    OR
    id = get_user_id_by_session_token(current_setting('request.headers', true)::json->>'x-session-token')
    OR
    role = 'pending' -- السماح للانتظار بالتسجيل
);

-- جدول payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Secure payments policy" ON payments;
CREATE POLICY "Secure payments policy" ON payments FOR ALL
USING (
    is_admin_session(current_setting('request.headers', true)::json->>'x-session-token')
    OR
    client_id = get_user_id_by_session_token(current_setting('request.headers', true)::json->>'x-session-token')
);

-- جدول service_requests
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Secure service requests policy" ON service_requests;
CREATE POLICY "Secure service requests policy" ON service_requests FOR ALL
USING (
    is_admin_session(current_setting('request.headers', true)::json->>'x-session-token')
    OR
    client_id = get_user_id_by_session_token(current_setting('request.headers', true)::json->>'x-session-token')
    OR
    provider_id = get_user_id_by_session_token(current_setting('request.headers', true)::json->>'x-session-token')
);

-- جدول company_expenses
ALTER TABLE company_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin only expenses" ON company_expenses;
CREATE POLICY "Admin only expenses" ON company_expenses FOR ALL
USING (is_admin_session(current_setting('request.headers', true)::json->>'x-session-token'));

-- جدول company_debts
ALTER TABLE company_debts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin only debts" ON company_debts;
CREATE POLICY "Admin only debts" ON company_debts FOR ALL
USING (is_admin_session(current_setting('request.headers', true)::json->>'x-session-token'));
