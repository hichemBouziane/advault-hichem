-- 1. إنشاء جدول سجل المعاملات المالية للمحفظة (wallet_transactions)
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL, -- موجب للشحن وسالب للخصم
    type TEXT NOT NULL CHECK (type IN ('payment', 'refund', 'service_escrow')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- 2. تفعيل جدار الحماية RLS على جدول المعاملات وتحديد سياسات القراءة
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Secure wallet transactions policy" ON wallet_transactions;
CREATE POLICY "Secure wallet transactions policy" ON wallet_transactions FOR ALL
USING (
    is_admin_session(current_setting('request.headers', true)::json->>'x-session-token')
    OR
    client_id = get_user_id_by_session_token(current_setting('request.headers', true)::json->>'x-session-token')
);


-- 3. تحديث وزناد الأرصدة التلقائي ليسجل المعاملات أوتوماتيكياً في قاعدة البيانات

-- أ. تحديث زناد الدفعات والمدفوعات
CREATE OR REPLACE FUNCTION handle_payment_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE clients
        SET balance = COALESCE(balance, 0) + NEW.amount_euro
        WHERE id = NEW.client_id;
        
        -- تسجيل عملية شحن رصيد
        INSERT INTO wallet_transactions (client_id, amount, type, description)
        VALUES (NEW.client_id, NEW.amount_euro, 'payment', 'شحن محفظة - دفعة جديدة');

    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE clients
        SET balance = COALESCE(balance, 0) - OLD.amount_euro + NEW.amount_euro
        WHERE id = NEW.client_id;
        
        -- تسجيل تعديل عملية شحن رصيد
        INSERT INTO wallet_transactions (client_id, amount, type, description)
        VALUES (NEW.client_id, -OLD.amount_euro + NEW.amount_euro, 'payment', 'تعديل قيمة شحن المحفظة');

    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE clients
        SET balance = COALESCE(balance, 0) - OLD.amount_euro
        WHERE id = OLD.client_id;
        
        -- تسجيل إلغاء عملية شحن رصيد
        INSERT INTO wallet_transactions (client_id, amount, type, description)
        VALUES (OLD.client_id, -OLD.amount_euro, 'payment', 'إلغاء وحذف دفعة شحن رصيد');
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ب. تحديث زناد حجز وخصم واسترجاع طلبات الخدمات والاشتراكات
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

        -- تسجيل حجز رصيد للخدمة
        INSERT INTO wallet_transactions (client_id, amount, type, description)
        VALUES (NEW.client_id, -NEW.price_usd, 'service_escrow', 'حجز رصيد للطلب: ' || NEW.service_name);

    ELSIF (TG_OP = 'UPDATE') THEN
        IF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
            UPDATE clients
            SET balance = COALESCE(balance, 0) + NEW.price_usd
            WHERE id = NEW.client_id;

            -- تسجيل استرجاع رصيد
            INSERT INTO wallet_transactions (client_id, amount, type, description)
            VALUES (NEW.client_id, NEW.price_usd, 'refund', 'استرجاع رصيد لرفض الطلب: ' || NEW.service_name);

        ELSIF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.provider_id IS NOT NULL THEN
            UPDATE provider_wallets
            SET payout_balance_usd = COALESCE(payout_balance_usd, 0) + NEW.price_usd
            WHERE provider_id = NEW.provider_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
