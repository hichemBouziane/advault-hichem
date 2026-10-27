-- 1. دالة للتحقق الآمن من تسجيل الدخول وتجنب إرجاع كلمات المرور للمتصفح
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
    redotpay_id TEXT
) AS $$
BEGIN
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
        c.redotpay_id::TEXT
    FROM clients c
    WHERE c.phone = p_phone 
      AND (c.password = p_password_plain OR c.password = p_password_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. دالة للتحقق الفوري من رتبة المستخدم في السيرفر عند تحميل لوحات التحكم لمنع التزوير
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
