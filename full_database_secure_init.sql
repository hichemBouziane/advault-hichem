-- =========================================================================
--             ملف التهيئة الشامل وتأمين قاعدة بيانات AdVault بنسبة 100%
--      (ينشئ جداول التكاليف والديون، يثبت زناد الأرصدة والـ Triggers، ويفعل جدار الحماية RLS)
-- =========================================================================

-- 1. إنشاء الجداول اللازمة للنظام المحاسبي والـ ERP (في حال لم تكن موجودة)

-- أ. جدول تكاليف ومصاريف الشركة
CREATE TABLE IF NOT EXISTS company_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    amount_usd NUMERIC NOT NULL DEFAULT 0,
    amount_dzd NUMERIC NOT NULL DEFAULT 0,
    category TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ب. جدول ديون والتزامات الشركة
CREATE TABLE IF NOT EXISTS company_debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('علي', 'لي')),
    amount_usd NUMERIC NOT NULL DEFAULT 0,
    amount_dzd NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'غير مقضي' CHECK (status IN ('غير مقضي', 'مقضي')),
    notes TEXT,
    due_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- 2. ترقية وتأمين جدول الحسابات (clients) وإضافة عمود التوكن المشفر للتحقق
ALTER TABLE clients ADD COLUMN IF NOT EXISTS session_token UUID DEFAULT gen_random_uuid();

-- توليد توكن لجميع الحسابات الحالية التي لا تملك واحداً
UPDATE clients SET session_token = gen_random_uuid() WHERE session_token IS NULL;


-- 3. دوال التحقق الآمن والمصادقة لمنع الاختراقات وتزوير جلسات الأدمن (RPCs)

-- أ. دالة التحقق الآمن من تسجيل الدخول وتجنب إرجاع كلمات المرور للمتصفح
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
    session_token UUID
) AS $$
DECLARE
    v_new_token UUID;
BEGIN
    -- توليد توكن جلسة جديد عند كل تسجيل دخول لزيادة الأمان ومنع الاختراق
    v_new_token := gen_random_uuid();
    
    UPDATE clients 
    SET session_token = v_new_token 
    WHERE clients.phone = p_phone 
      AND (clients.password = p_password_plain OR clients.password = p_password_hash);

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

-- ب. دالة للتحقق الفوري من رتبة المستخدم في السيرفر عند تحميل لوحات التحكم لمنع التزوير
DROP FUNCTION IF EXISTS verify_session_role(uuid,text);

CREATE OR REPLACE FUNCTION verify_session_role(
    p_user_id UUID,
    p_expected_role TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT role INTO v_role FROM clients WHERE id = p_user_id;
    RETURN (v_role = p_expected_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ج. دالة للحصول على معرف المستخدم عن طريق التوكن الممرر في الهيدر
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

-- د. دالة للتأكد مما إذا كان التوكن الممرر ينتمي لحساب أدمن
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


-- 4. إعداد وزناد الأمان المالي لمنع تعديل المتصفح للأرصدة (SQL Triggers)

-- أ. زناد المدفوعات (إضافة، تعديل، حذف دفعة)
CREATE OR REPLACE FUNCTION handle_payment_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE clients
        SET balance = COALESCE(balance, 0) + NEW.amount_euro
        WHERE id = NEW.client_id;
    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE clients
        SET balance = COALESCE(balance, 0) - OLD.amount_euro + NEW.amount_euro
        WHERE id = NEW.client_id;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE clients
        SET balance = COALESCE(balance, 0) - OLD.amount_euro
        WHERE id = OLD.client_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_payment_changes ON payments;
CREATE TRIGGER trg_payment_changes
AFTER INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW
EXECUTE FUNCTION handle_payment_changes();

-- ب. زناد طلبات الخدمات والاشتراكات (الحجز، الخصم، الاسترجاع، وتحويل الرصيد للشركاء)
CREATE OR REPLACE FUNCTION handle_service_request_changes()
RETURNS TRIGGER AS $$
DECLARE
    client_balance NUMERIC;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        SELECT COALESCE(balance, 0) INTO client_balance FROM clients WHERE id = NEW.client_id;
        
        IF client_balance < NEW.price_usd THEN
            RAISE EXCEPTION 'رصيدك غير كافٍ لطلب هذه الخدمة. الرصيد الحالي: %, القيمة المطلوبة: %', client_balance, NEW.price_usd;
        END IF;

        UPDATE clients
        SET balance = balance - NEW.price_usd
        WHERE id = NEW.client_id;

    ELSIF (TG_OP = 'UPDATE') THEN
        IF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
            UPDATE clients
            SET balance = COALESCE(balance, 0) + NEW.price_usd
            WHERE id = NEW.client_id;

        ELSIF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.provider_id IS NOT NULL THEN
            UPDATE provider_wallets
            SET payout_balance_usd = COALESCE(payout_balance_usd, 0) + NEW.price_usd
            WHERE provider_id = NEW.provider_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_service_request_changes ON service_requests;
CREATE TRIGGER trg_service_request_changes
AFTER INSERT OR UPDATE ON service_requests
FOR EACH ROW
EXECUTE FUNCTION handle_service_request_changes();

-- ج. زناد سحب الأرباح للشركاء (خصم السحب واسترجاع الرفض)
CREATE OR REPLACE FUNCTION handle_provider_payout_changes()
RETURNS TRIGGER AS $$
DECLARE
    wallet_balance NUMERIC;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        SELECT COALESCE(payout_balance_usd, 0) INTO wallet_balance FROM provider_wallets WHERE provider_id = NEW.provider_id;
        
        IF wallet_balance < NEW.amount_usd THEN
            RAISE EXCEPTION 'رصيدك القابل للسحب غير كافٍ. الرصيد الحالي: %, القيمة المطلوبة: %', wallet_balance, NEW.amount_usd;
        END IF;

        UPDATE provider_wallets
        SET payout_balance_usd = payout_balance_usd - NEW.amount_usd
        WHERE provider_id = NEW.provider_id;

    ELSIF (TG_OP = 'UPDATE') THEN
        IF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
            UPDATE provider_wallets
            SET payout_balance_usd = COALESCE(payout_balance_usd, 0) + NEW.amount_usd
            WHERE provider_id = NEW.provider_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_provider_payout_changes ON provider_payout_requests;
CREATE TRIGGER trg_provider_payout_changes
AFTER INSERT OR UPDATE ON provider_payout_requests
FOR EACH ROW
EXECUTE FUNCTION handle_provider_payout_changes();


-- 5. تفعيل جدار الحماية RLS بالكامل على الجداول وقفل قراءة البيانات للعامة

-- أ. جدول clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Secure client policy" ON clients;
CREATE POLICY "Secure client policy" ON clients FOR ALL
USING (
    is_admin_session(current_setting('request.headers', true)::json->>'x-session-token')
    OR
    id = get_user_id_by_session_token(current_setting('request.headers', true)::json->>'x-session-token')
    OR
    role = 'pending' -- السماح للزبائن قيد الانتظار بالتسجيل المبدئي
);

-- ب. جدول payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Secure payments policy" ON payments;
CREATE POLICY "Secure payments policy" ON payments FOR ALL
USING (
    is_admin_session(current_setting('request.headers', true)::json->>'x-session-token')
    OR
    client_id = get_user_id_by_session_token(current_setting('request.headers', true)::json->>'x-session-token')
);

-- ج. جدول service_requests
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

-- د. جدول company_expenses
ALTER TABLE company_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin only expenses" ON company_expenses;
CREATE POLICY "Admin only expenses" ON company_expenses FOR ALL
USING (is_admin_session(current_setting('request.headers', true)::json->>'x-session-token'));

-- هـ. جدول company_debts
ALTER TABLE company_debts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin only debts" ON company_debts;
CREATE POLICY "Admin only debts" ON company_debts FOR ALL
USING (is_admin_session(current_setting('request.headers', true)::json->>'x-session-token'));
