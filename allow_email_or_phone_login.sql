-- تحديث دالة التحقق من تسجيل الدخول لدعم تسجيل الدخول برقم الهاتف أو بالبريد الإلكتروني معاً
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
    -- توليد توكن جلسة جديد عند كل تسجيل دخول
    v_new_token := gen_random_uuid();
    
    -- تحديث توكن الجلسة للعميل (سواء أدخل رقم الهاتف أو البريد الإلكتروني)
    UPDATE clients 
    SET session_token = v_new_token 
    WHERE (phone = p_phone OR LOWER(email) = LOWER(p_phone))
      AND (password = p_password_plain OR password = p_password_hash);

    -- إرجاع بيانات العميل للمتصفح
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
        c.session_token
    FROM clients c
    WHERE (c.phone = p_phone OR LOWER(c.email) = LOWER(p_phone))
      AND (c.password = p_password_plain OR c.password = p_password_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
