/*
  클라우드 저장(구글 로그인) 설정 파일

  - 이대로 두면(null) 기록은 휴대폰에만 저장됩니다. 앱은 정상 동작해요.
  - 클라우드 저장을 켜려면 설치 안내서(README.md)의 "클라우드 저장 켜기"를 따라
    Firebase 콘솔에서 복사한 값을 아래처럼 붙여 넣으세요.

  window.FIREBASE_CONFIG = {
    apiKey: "AIza....",
    authDomain: "내프로젝트.firebaseapp.com",
    projectId: "내프로젝트",
    storageBucket: "내프로젝트.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef"
  };
*/
window.FIREBASE_CONFIG = null;
