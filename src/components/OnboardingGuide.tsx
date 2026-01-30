/**
 * [INPUT]: 依赖 public/assets/bg.png
 * [OUTPUT]: 提供空状态引导插图
 * [POS]: SupplyDepotApp 的引导组件
 */

export function OnboardingGuide() {
  return (
    <div className="pt-4">
      <img
        src="/assets/bg.png"
        alt="DeepFlow 学习流程"
        className="w-full h-auto rounded-2xl"
      />
    </div>
  );
}
