-- supabase/migrations/20260701000001_add_portfolio_config.sql

ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS portfolio_config jsonb NOT NULL DEFAULT '{"products":[]}';

UPDATE system_settings
  SET portfolio_config = jsonb_build_object(
    'products',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'PTCAD',
        'name', 'PTCAD AI',
        'category', 'CAD / Engineering Software',
        'description', 'ซอฟต์แวร์ออกแบบ CAD สำหรับงานอุตสาหกรรมการผลิต (production manufacturing) ช่วยวิศวกรและนักออกแบบสร้าง 2D/3D model, ทำ BOM, และจัดการ drawing อย่างมืออาชีพ เหมาะกับโรงงาน SME ถึงขนาดกลางในภาคการผลิตของไทยและ ASEAN',
        'targetUsers', 'วิศวกรออกแบบ, ทีม R&D, โรงงานการผลิต, ผู้รับเหมาในอุตสาหกรรม'
      ),
      jsonb_build_object(
        'id', 'APP.AI',
        'name', 'APP.AI',
        'category', 'AI Platform / No-Code / Low-Code',
        'description', 'แพลตฟอร์ม AI สำหรับสร้าง business application แบบ no-code/low-code ให้องค์กรสร้าง AI-powered workflow, chatbot, document processing, และ data pipeline โดยไม่ต้องมี developer เต็มรูปแบบ มุ่งเน้น SME และ enterprise ในไทยที่ต้องการ digital transformation',
        'targetUsers', 'Business users, ทีม IT องค์กร, SME ที่ต้องการ automation'
      ),
      jsonb_build_object(
        'id', 'COBO',
        'name', 'COBO',
        'category', 'ERP / Accounting / Business Management',
        'description', 'ระบบ ERP และบัญชีสำหรับธุรกิจไทย ครอบคลุม accounting, inventory, procurement, HR/payroll, และ financial reporting รองรับมาตรฐานบัญชีไทย (TAS) และภาษีมูลค่าเพิ่ม (VAT) เหมาะกับ SME ไทยที่ต้องการระบบบัญชีครบวงจรราคาที่เข้าถึงได้',
        'targetUsers', 'นักบัญชี, ทีม Finance, ผู้บริหาร SME, ธุรกิจการค้าและบริการ'
      ),
      jsonb_build_object(
        'id', 'CRM',
        'name', 'CRM',
        'category', 'CRM / Sales / Customer Success',
        'description', 'ระบบ CRM สำหรับจัดการลูกค้า, pipeline การขาย, และ customer success ช่วยทีมขายและ BD ติดตาม lead, จัดการ deal, บันทึก interaction history, และวิเคราะห์ performance การขาย รองรับทั้ง B2B และ B2C สำหรับธุรกิจไทย',
        'targetUsers', 'ทีมขาย, Account Manager, BD Team, Customer Success'
      )
    )
  );
