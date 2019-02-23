const pull = require('pull-stream')
const map = require('pull-stream/throughs/map')
const reduce = require('pull-stream/sinks/reduce')
const bignum = require('bignum')

const INITIAL_RND_MASK = bignum.fromBuffer(Buffer.alloc(4, 0xff)).shiftLeft(32)
const FULL_SET_MASK = bignum.fromBuffer(Buffer.alloc(8, 0xff))
const ZERO_MASK = bignum.fromBuffer(Buffer.alloc(8, 0x00))

const RND_WEIGHTS = {
  32: 2,
  16: 3,
  8: 5,
  4: 8,
  2: 13,
  1: 21
}

var BIT_MASKS = []
for (var i = 0; i < 64; i++) {
  BIT_MASKS[i] = bignum.fromBuffer(Buffer.alloc(1, 0x01)).shiftLeft(i)
}

var Scoring = {}
module.exports = Scoring

Scoring.max_score_of_entry = function(scores) {
  return Object.keys(scores).reduce((a, score) => {
    if (scores[score] > 0) {
      return Math.max(a, score)
    } else {
      return a
    }
  }, 0)
}

Scoring.scores_of_entry = function (ipfs, results, entry_cid) {
  return new Promise((resolve, reject) => {
    let stream = ipfs.files.catPullStream(entry_cid)

    pull(
      stream,
      map((data) => {
        // var t = 0
        var scores = {}
        for (var i = 0; i < data.length/8; i++) {
          // var start = new Date()

          let bracket = bignum.fromBuffer(data.slice(i, i+8))
          let score = Scoring.score_bracket(results, bracket)

          // t += new Date() - start
          if (scores[score]) {
            scores[score] = scores[score].add(1)
          } else {
            scores[score] = bignum(1)
          }
        }
        // console.log(`average time: ${t / (data.length/8)}`)
        // console.log(`max_score: ${max_score}`)
        return scores
      }),
      reduce((acc, scores) => {
        return Object.keys(scores).reduce((acc, score) => {
          var all_scores = acc
          if (all_scores[score]) {
            all_scores[score] = all_scores[score] + scores[score]
          } else {
            all_scores[score] = scores[score]
          }
          return all_scores
        }, acc)
      }, {}, (err, res) => {
        if (err) reject(err)
        resolve(res)
      })
    )
  })
}

Scoring.score_bracket = function (results, bracket) {
  let correct_game_mask = bracket.xor(results)
    .xor(FULL_SET_MASK)

  return _score_bracket(correct_game_mask, bracket, INITIAL_RND_MASK, 32)
}

function _score_bracket(correct_game_mask, bracket, rnd_mask, num_games_in_rnd) {
  if (num_games_in_rnd < 1) {
    return 0
  }

  let correct_games_in_rnd_mask = correct_game_mask.and(rnd_mask)
  let rnd_start_bit = (num_games_in_rnd*2)-1
  let next_rnd_start_bit = rnd_start_bit-num_games_in_rnd

  var correct_game_count = 0
  var next_rnd_mask = ZERO_MASK
  for (var i = 0; i < num_games_in_rnd; i++) {
    let mask = BIT_MASKS[rnd_start_bit-i]
    if (correct_games_in_rnd_mask.and(mask) > 0) {
      correct_game_count += 1

      let next_rnd_game = BIT_MASKS[next_rnd_start_bit-Math.ceil((i-1) / 2)]
      next_rnd_mask = next_rnd_mask.or(next_rnd_game)
    }
  }

  let rnd_score = RND_WEIGHTS[num_games_in_rnd] * correct_game_count
  return rnd_score + _score_bracket(correct_game_mask, bracket, next_rnd_mask, num_games_in_rnd / 2)
}
