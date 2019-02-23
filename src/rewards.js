const Scoring = require('./scoring')

var Rewards = {}
module.exports = Rewards

Rewards.get_best_entry_cid = function (entry_scores) {
  return Object.keys(entry_scores).reduce((a, b) => {
    let max_score_a = Scoring.max_score_of_entry(entry_scores[a])
    let max_score_b = Scoring.max_score_of_entry(entry_scores[b])
    if (max_score_a == max_score_b) {
      return a > b ? a : b // Tiebreaker: string comparison of cid
    } else {
      return max_score_a > max_score_b ? a : b
    }
  })
}

Rewards.get_calculate_reward_f = function (num_of_brackets) { // in wei
  let e = Math.log(num_of_brackets) / Math.log(10) // log[10](num_of_brackets)
  let p = Math.pow(10, (2-e))
  return function calculate_reward(pot_size) {
    return Math.ceil(p * pot_size)
  }
}
