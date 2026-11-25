export const RULE_WINDOWS={own_turn:{implemented:true},automatic:{implemented:true},anytime:{implemented:false},before_damage:{implemented:false},contest_declared:{implemented:false},attribute_selection:{implemented:false},dice_generated:{implemented:false},dice_revealed:{implemented:false},contest_modifier:{implemented:false},contest_result:{implemented:false},after_damage:{implemented:true}};
export const RULE_EVENTS={manual:{implemented:true},battle_end:{implemented:true},attack_finished:{implemented:true},kill:{implemented:true},after_move:{implemented:true},hp_changed:{implemented:true},damage_taken:{implemented:true},damage_dealt:{implemented:true},battle_round_start:{implemented:true},battle_round_end:{implemented:true},time_turn_start:{implemented:true},time_turn_end:{implemented:true},day_start:{implemented:true},day_end:{implemented:true},resource_spent:{implemented:true},skill_used:{implemented:true},attack_declared:{implemented:true},unit_died:{implemented:true},unit_revived:{implemented:true},contest_result:{implemented:true},dice_revealed:{implemented:false},attribute_selection:{implemented:false}};
export const RULE_EFFECTS={modifier:{implemented:true,fields:['stat','value','stack','timer']},heal:{implemented:true,fields:['amount']},gain_resource:{implemented:true,fields:['resource','amount']},remove_modifier:{implemented:true,fields:['key']},schedule:{implemented:true,fields:['after','costs','effects']},reveal_dice:{implemented:false},guess_relative_attribute:{implemented:false},override_contest_attribute:{implemented:false},spawn_entity:{implemented:false},craft_item:{implemented:false},switch_form:{implemented:false},resource_substitution:{implemented:false},teleport:{implemented:false}};
export const RULE_SCOPES=['battle_round','time_turn','day','battle','campaign','attack','segment','turn'];
export const RULE_COUNTERS=[
 {id:'moved_cells_this_round',event:'after_move',field:'cells',scope:'battle_round'},
 {id:'moved_cells_battle',event:'after_move',field:'cells',scope:'battle'},
 {id:'ap_spent_this_round',event:'resource_spent',field:'amount',filter:{resource:'ap'},scope:'battle_round'},
 {id:'damage_dealt_this_round',event:'damage_dealt',field:'amount',scope:'battle_round'},
 {id:'damage_taken_this_round',event:'damage_taken',field:'amount',scope:'battle_round'},
 {id:'actual_hp_lost_battle',event:'hp_changed',field:'hp_loss',scope:'battle'},
 {id:'attacks_battle',event:'attack_declared',field:null,scope:'battle'},
 {id:'skills_battle',event:'skill_used',field:null,scope:'battle'},
 {id:'kills_battle',event:'kill',field:null,scope:'battle'},
 {id:'contest_success_battle',event:'contest_result',field:'success',scope:'battle'},
 {id:'contest_failure_battle',event:'contest_result',field:'failure',scope:'battle'}
];
