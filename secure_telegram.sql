-- 1. تفعيل مكتبة HTTP في قاعدة البيانات لإرسال طلبات الويب مباشرة من السيرفر
CREATE EXTENSION IF NOT EXISTS http;


-- 2. دالة إرسال تنبيهات تليجرام الآمنة من السيرفر وإخفاء توكن البوت عن المتصفح
DROP FUNCTION IF EXISTS secure_send_telegram(text,text,jsonb);

CREATE OR REPLACE FUNCTION secure_send_telegram(
    p_message TEXT,
    p_chat_id TEXT,
    p_reply_markup JSONB DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_url TEXT;
    v_body TEXT;
    v_response RECORD;
    -- توكن البوت السري محفوظ هنا في السيرفر ولا يظهر أبداً للمتصفح
    v_token TEXT := '8636070898:AAFA5OZwJ81WqVvC9TfaudmOjLKV4r43tcM';
    v_default_chat_id TEXT := '1746721547';
    v_target_chat_id TEXT;
BEGIN
    -- تحديد المعرف المستهدف (الأدمن كافتراضي)
    v_target_chat_id := COALESCE(p_chat_id, v_default_chat_id);
    IF v_target_chat_id = '' THEN
        v_target_chat_id := v_default_chat_id;
    END IF;

    v_url := 'https://api.telegram.org/bot' || v_token || '/sendMessage';
    
    IF p_reply_markup IS NULL THEN
        v_body := json_build_object('chat_id', v_target_chat_id, 'text', p_message)::text;
    ELSE
        v_body := json_build_object('chat_id', v_target_chat_id, 'text', p_message, 'reply_markup', p_reply_markup)::text;
    END IF;

    -- إرسال الطلب للسيرفر الخاص بتليجرام
    SELECT * INTO v_response FROM http_post(v_url, v_body, 'application/json');
    
    RETURN v_response.content::json;
EXCEPTION WHEN OTHERS THEN
    -- في حال حدث خطأ بالمكتبة، لا نوقف عمل الاستعلام بل نرجع رسالة خطأ
    RETURN json_build_object('status', 'error', 'message', SQLERRM)::json;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
