# 多词条通用技能模型 v1.0

入口：建卡 → 资源与新技能 → **多词条技能（数据模式）**。可以粘贴JSON，保存时服务端重新验证；每个词条有独立发动按钮。隔离沙盒使用同一解析器与运行Handler，不修改真实房间。

`examples/unified/`提供三个真实技能的待裁定/缺Handler配置及一个明确参数的可运行演示。未写明的持续时间使用未解析变量并标记needs_ruling，不能直接执行。

## 结构

技能有稳定id、category、独立counters及任意数量clauses（本版以128条作为执行规模上限）。词条支持window、trigger、condition、costs、variables、counter、timer、targeting、effects、limit、interaction、cleanup和状态/问题说明。后两个高级节点并非都已接入：未知交互与细窗口明确标requires_handler。现阶段运行时只消费已实现节点，不用文本推断机制。

- **window**决定允许在哪个合法边界执行；**trigger**决定监听哪类事件。主动own_turn与自动automatic分离，anytime及对抗内部窗口尚未放开。
- 每条变量仅在本次词条内有效，按需求值并在执行前检查。互相循环、未知引用、除零、溢出等拒绝执行。
- `self.hp/max_hp/mp/max_mp/ap/morale/shield/missing_hp/hp_ratio`；`self.attribute.str/end/agi/mana/luck`；`self.resource.res_id`与`self.max_resource.res_id`；target具有同样的受控引用。通用伤害/防御/对抗加值可引用，但不包含所有卡牌专属被动的上下文判断。
- `counter.id`读取独立作用域的累计；`event.raw_damage/final_damage/hp_loss/resource_amount/cells/dice_total/success/target_count/segments/crossings`读取已生成事件快照，字段尚未生成则报错，绝不拿0冒充隐藏或未知值。
- 当前值引用在合法执行窗口读取；事件引用是已记录事实。局部变量在本次生效前捕获。持续修正保存本次计算结果，不会偷偷变成持续重算公式。
- 本实现中raw_damage是防御前值，final_damage是防御（含盾）后拟扣HP值，hp_loss是锁血、当前生命钳制后的实际HP变化。它们独立存储。源文本使用哪种口径不明时须待裁定。

## 安全公式

支持`+ - * / %`（%为取余）、比较、`&& || !`、`floor/ceil/min/max/abs/percent/clamp`，例如：

- `floor(total_hp_lost / (max_hp * 0.1))`
- `min(counter.moved_cells_this_round, 18)`
- `X * 400`
- `target.max_hp - target.hp`

`total_hp_lost`明确指本场累计实际HP损失，包含伤害与生命流失，不是当前缺失HP；若原卡不是此口径，配置自定义计数器并明确筛选。JSON数据模式推荐资源ID使用字母、数字、下划线与点，以便作为公式引用。

禁止eval、任意函数、对象/原型访问与赋值。公式最大1024字/256词法单元/32层，事件链最多128次分发。超出预算中止后续触发并记录错误，已完成的原子结算保留；没有声称支持整条链无限回滚。

## 计数与计时

内置移动、AP支出、伤害承受/造成、实际HP损失、攻击、主动技能与对抗成功失败计数；自定义计数器按event、field、filter、scope独立配置。主要AP/MP支付路径已接入；日结维持费等旧的直接写值路径尚未全部转为事件，不将其算作已完整覆盖。

移动计数使用实际合法最短路径长度，保留原移动/AP规则；与伤害加成分开。每个范围在读取时按时钟键独立重置。`reset:never`保留到显式清理，`reset:threshold`由阈值词条扣除已用阈值。

阈值词条一次聚合多次跨越，`event.crossings`给出跨越次数；需要每次获得1点时使用该值，而不是把当前缺失HP当累计。代价是否也乘次数由公式显式决定。

持续N周期只接受battle_round、time_turn、day；scope battle/campaign/attack/segment/turn用于对应生命周期与事件计数。持续N周期包含施加当周期，到下一周期边界到期。来源死亡清理与按周期到期独立。战斗轮定时器不会跨战斗误触发。

`timer.consumeOn`和`uses`表达下一次/若干次；攻击加成在整个已声明攻击完成后消费，对抗加成在该次结果记录后消费。新授予的“下次”修正不会被授予它的同一结果事件误消费。

叠加可add、replace、refresh、independent、max、none，允许上限。add保留原到期时间，refresh仅刷新时间，replace替换数值及时间；max保留独立项，只汇总最高值。不同语义需要显式配置，不能凭卡名猜。

## 代价与权限

固定、当前/最大百分比、全部和多资源联合支付；可选floor/ceil/exact，实际资源支付须为非负整数。固定MP保留第8天翻倍；比例/全部按显式口径计算，不额外重复翻倍。HP代价保留至少1，死亡支付、最大值牺牲和资源替代尚未接入。

全部变量、代价和效果先验证，再扣资源。词条独立限次、冷却。服务端按actor所有权、合法窗口及目标距离重新检查。私有计数器、局部变量、未来任务、技能配置不发给对手；可查看自身所有修正及自己施加给他人的修正。

高阶秘密互动、异属性对抗、实体和牺牲类成本仍需Handler，详见机制审计；本版的数据模式和沙盒不是对全部原卡的自动实现承诺。
