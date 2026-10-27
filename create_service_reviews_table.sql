-- 1. إنشاء جدول تقييمات الخدمات
CREATE TABLE IF NOT EXISTS service_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES service_requests(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE CASCADE,
    client_name TEXT NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. تفعيل السياسات الأمنية
ALTER TABLE service_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read access on service_reviews" ON service_reviews FOR SELECT USING (true);
CREATE POLICY "Allow anonymous write access on service_reviews" ON service_reviews FOR INSERT WITH CHECK (true);
