-- 1. تفعيل حماية RLS للجداول للتأكيد
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;

-- 2. حذف أي سياسات قديمة قد تسبب تعارضاً
DROP POLICY IF EXISTS "Allow anonymous read access on services" ON services;
DROP POLICY IF EXISTS "Allow anonymous write access on services" ON services;
DROP POLICY IF EXISTS "Allow anonymous update access on services" ON services;
DROP POLICY IF EXISTS "Allow anonymous delete access on services" ON services;

DROP POLICY IF EXISTS "Allow anonymous read access on service_requests" ON service_requests;
DROP POLICY IF EXISTS "Allow anonymous write access on service_requests" ON service_requests;
DROP POLICY IF EXISTS "Allow anonymous update access on service_requests" ON service_requests;

-- 3. إنشاء السياسات الجديدة بصلاحيات وصول مفتوحة للـ Anon Key المستخدم
CREATE POLICY "Allow anonymous read access on services" ON services FOR SELECT USING (true);
CREATE POLICY "Allow anonymous write access on services" ON services FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on services" ON services FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access on services" ON services FOR DELETE USING (true);

CREATE POLICY "Allow anonymous read access on service_requests" ON service_requests FOR SELECT USING (true);
CREATE POLICY "Allow anonymous write access on service_requests" ON service_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on service_requests" ON service_requests FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access on service_requests" ON service_requests FOR DELETE USING (true);
