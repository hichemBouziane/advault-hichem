-- 1. دالة وزناد لتحديث الرصيد تلقائياً عند إدخال أو تعديل أو حذف دفعة للزبون
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


-- 2. دالة وزناد للتحكم الكامل في حجز وخصم واسترجاع وتحويل أموال الخدمات عبر السيرفر
CREATE OR REPLACE FUNCTION handle_service_request_changes()
RETURNS TRIGGER AS $$
DECLARE
    client_balance NUMERIC;
BEGIN
    -- أ. عند إنشاء طلب جديد (INSERT)
    IF (TG_OP = 'INSERT') THEN
        -- جلب رصيد الزبون الحالي
        SELECT COALESCE(balance, 0) INTO client_balance FROM clients WHERE id = NEW.client_id;
        
        -- التحقق من كفاية الرصيد
        IF client_balance < NEW.price_usd THEN
            RAISE EXCEPTION 'رصيدك غير كافٍ لطلب هذه الخدمة. الرصيد الحالي: %, القيمة المطلوبة: %', client_balance, NEW.price_usd;
        END IF;

        -- خصم قيمة الخدمة من رصيد العميل فوراً (حجز في الضمان Escrow)
        UPDATE clients
        SET balance = balance - NEW.price_usd
        WHERE id = NEW.client_id;

    -- ب. عند تعديل حالة الطلب (UPDATE)
    ELSIF (TG_OP = 'UPDATE') THEN
        -- حالة 1: رفض الطلب (rejected) -> إرجاع المبلغ المحجوز فوراً لرصيد الزبون
        IF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
            UPDATE clients
            SET balance = COALESCE(balance, 0) + NEW.price_usd
            WHERE id = NEW.client_id;

        -- حالة 2: اكتمال وتسليم العمل (completed) -> إرسال الرصيد لمحفظة الشريك (مقدم الخدمة)
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


-- 3. دالة وزناد للتحكم الكامل في سحب أرباح الشركاء (حظر السحب برصيد وهمي واسترجاع الرفض)
CREATE OR REPLACE FUNCTION handle_provider_payout_changes()
RETURNS TRIGGER AS $$
DECLARE
    wallet_balance NUMERIC;
BEGIN
    -- أ. عند طلب سحب جديد (INSERT)
    IF (TG_OP = 'INSERT') THEN
        -- جلب رصيد المحفظة الحالي للشريك
        SELECT COALESCE(payout_balance_usd, 0) INTO wallet_balance FROM provider_wallets WHERE provider_id = NEW.provider_id;
        
        -- التحقق من الرصيد
        IF wallet_balance < NEW.amount_usd THEN
            RAISE EXCEPTION 'رصيدك القابل للسحب غير كافٍ. الرصيد الحالي: %, القيمة المطلوبة: %', wallet_balance, NEW.amount_usd;
        END IF;

        -- خصم المبلغ المستقطع مؤقتاً من المحفظة
        UPDATE provider_wallets
        SET payout_balance_usd = payout_balance_usd - NEW.amount_usd
        WHERE provider_id = NEW.provider_id;

    -- ب. عند تعديل حالة الطلب (UPDATE)
    ELSIF (TG_OP = 'UPDATE') THEN
        -- إذا تم رفض طلب السحب (rejected) -> إرجاع الرصيد للمحفظة تلقائياً
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
