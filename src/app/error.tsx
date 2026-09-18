"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="loading-page">
      <h1>データを表示できませんでした</h1>
      <p>接続状態を確認して、再度お試しください。</p>
      <button onClick={reset}>再試行する</button>
    </div>
  );
}
