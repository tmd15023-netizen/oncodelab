export const DEFAULT_TESTS = [
  {
    id: "think",
    title: "컴퓨팅 사고력 TEST",
    summary: "놀이와 논리로 생각하는 힘을 확인합니다.",
    password: "think2026",
    body: "언플러그드 활동과 알고리즘 문제로 사고 과정을 기록합니다. 정답보다 왜 그렇게 생각했는지를 적어 보세요.",
  },
  {
    id: "code",
    title: "프로그래밍 TEST",
    summary: "생각을 코드로 구현하는 경험을 확인합니다.",
    password: "code2026",
    body: "Scratch, Entry, Python 중 수업에서 사용한 도구로 미션을 완성하세요. 막힌 지점과 해결 방법을 함께 남깁니다.",
  },
  {
    id: "physical",
    title: "피지컬 컴퓨팅 TEST",
    summary: "코딩이 현실의 움직임으로 이어지는지 확인합니다.",
    password: "robot2026",
    body: "로봇, 센서, 마이크로비트 또는 아두이노로 주어진 미션을 실행하고 결과를 사진이나 기록으로 남기세요.",
  },
  {
    id: "ai",
    title: "AI · 디지털 창작 TEST",
    summary: "AI를 활용해 결과물을 만들고 판단하는 힘을 확인합니다.",
    password: "ai2026",
    body: "생성형 AI로 초안을 만든 뒤, 직접 수정해 목적에 맞는 결과물로 완성하세요. AI가 한 일과 내가 한 일을 구분해서 적습니다.",
  },
  {
    id: "adult",
    title: "성인 · 교원 TEST",
    summary: "업무와 교육 현장에 바로 적용하는 활용력을 확인합니다.",
    password: "teach2026",
    body: "실제 업무 또는 수업 장면을 하나 고르고, AI·디지털 도구로 해결 과정을 설계해 보세요. 적용 계획까지 작성합니다.",
  },
];

export const DEFAULT_CLASSES = [
  { id: "class-ai", label: "AI", tone: "live", status: "온라인 · 진행중", title: "AI · 생성형 AI 교육", summary: "프롬프트부터 콘텐츠 제작, 업무 활용까지" },
  { id: "class-code", label: "CODE", tone: "vod", status: "온라인 · 진행중", title: "프로그래밍 교육", summary: "Scratch, Entry, Python, 앱인벤터" },
  { id: "class-robot", label: "ROBOT", tone: "off", status: "온라인 · 진행중", title: "피지컬 컴퓨팅 교육", summary: "로봇코딩, 아두이노, 마이크로비트, 자율주행" },
  { id: "class-vibe", label: "VIBE", tone: "live", status: "온라인 · 진행중", title: "AI · 디지털 창작 교육", summary: "생성형 AI, 바이브코딩, 웹·콘텐츠 제작" },
  { id: "class-career", label: "CAREER", tone: "vod", status: "온라인 · 진행중", title: "진로 · 취업 AI 활용", summary: "자기소개서, 이력서, AI 면접 준비" },
  { id: "class-teach", label: "TEACH", tone: "off", status: "온라인 · 진행중", title: "성인 · 교원 교육", summary: "생성형 AI 실무, 교원 연수, 업무 활용" },
];

export const DEFAULT_NOTICES = [
  {
    id: "notice-1",
    tag: "공지",
    title: "2026년 상반기 교육 일정 안내",
    body: "2026년 상반기 정규·특강 일정을 안내드립니다. 자세한 시간표와 신청 방법은 Class 페이지에서 확인하실 수 있습니다.",
    createdAt: new Date("2026-03-02"),
  },
  {
    id: "notice-2",
    tag: "공지",
    title: "강사 모집 및 협력 교육 안내",
    body: "온코드랩과 함께할 강사님을 모집합니다. 지원을 원하시는 분은 강사 신청 페이지에서 신청해 주세요.",
    createdAt: new Date("2026-02-16"),
  },
  {
    id: "notice-3",
    tag: "안내",
    title: "TEST 자료 업데이트",
    body: "컴퓨팅 사고력, 프로그래밍, 피지컬 컴퓨팅, AI 영역의 TEST 문항과 진단 자료가 새롭게 업데이트되었습니다.",
    createdAt: new Date("2026-01-20"),
  },
  {
    id: "notice-4",
    tag: "안내",
    title: "방학 특강 및 프로젝트 수업 모집",
    body: "방학 기간 동안 진행되는 특강과 프로젝트 수업 신청을 받고 있습니다. 문의는 수업 신청 페이지를 이용해 주세요.",
    createdAt: new Date("2025-12-18"),
  },
];

export const DEFAULT_APPLY_FIELDS = [
  { id: "field-name", label: "이름", type: "text", required: true, options: [], order: 0 },
  { id: "field-email", label: "이메일", type: "email", required: true, options: [], order: 1 },
  { id: "field-phone", label: "전화번호", type: "tel", required: true, options: [], order: 2 },
  { id: "field-message", label: "문의 내용", type: "textarea", required: true, options: [], order: 3 },
];

export const DEFAULT_POSTS = [
  {
    id: "post-1",
    tag: "후기",
    title: "바이브코딩으로 첫 웹사이트를 만들어본 이야기",
    body: "생성형 AI와 함께 코드를 작성하면서 처음으로 웹사이트를 완성했습니다. 막막했던 시작이 결과물로 이어지는 과정이 재미있었어요.",
    createdAt: new Date("2026-08-12"),
  },
  {
    id: "post-2",
    tag: "질문",
    title: "초등 저학년 엔트리 수업, 어떻게 시작하나요?",
    body: "초등 저학년 학생들에게 엔트리를 처음 소개할 때 어떤 활동으로 시작하면 좋을지 선생님들의 노하우가 궁금합니다.",
    createdAt: new Date("2026-08-04"),
  },
  {
    id: "post-3",
    tag: "공유",
    title: "생성형 AI 프롬프트 수업 활동 아이디어",
    body: "학생들과 함께 해본 프롬프트 작성 활동을 공유합니다. 이야기 만들기, 그림 설명하기 등으로 시작하면 반응이 좋았습니다.",
    createdAt: new Date("2026-07-22"),
  },
  {
    id: "post-4",
    tag: "후기",
    title: "로봇 코딩 수업에서 실패가 배움이 된 순간",
    body: "여러 번 실패한 미션을 스스로 고쳐 성공했을 때 아이들의 표정이 잊히지 않습니다. 실패를 다루는 방식이 수업의 핵심이라고 느꼈습니다.",
    createdAt: new Date("2026-07-09"),
  },
];
