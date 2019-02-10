const IPFS = require('ipfs')

const pull = require('pull-stream')
const map = require('pull-stream/throughs/map')
const reduce = require('pull-stream/sinks/reduce')
const fs = require('fs')
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

const ipfs = new IPFS()

ipfs.on('ready', async () => {
  console.log('Node is ready to use!')

  let res = await ipfs.files.cat("/ipfs/QmWUbneqDLtSSHeRqG1DmPT8RHKNE366RGopWQwqWjZxJG") // 2017 results
  let results = bignum.fromBuffer(res)

  let entries = [
    "/ipfs/QmWCn2w2XFXZMjB8hNXHx53NMygfGpwLsbDVhrrw85erJM",
    "/ipfs/QmScjqM9ih42FUEWEwcHvmqNEVGjE6AHAFeKzobNKg8qjW",
    "/ipfs/QmT84pTBAuMVzy2phGceRrLjYMSWh9ZkJYRu172ego1Ljh",
    "/ipfs/QmbQDMq6atfRSfJbDpr63kgrHQ3rs5M8jUTTPP7XeKYFJs",
    "/ipfs/QmdeaJKt9JKCB6BnGSmaotVRgzb7KD21q4rcveHHxVffR5",
    "/ipfs/QmUBUXzCnj8vYwWfZLWucVtuwJPYSE9wFfp5ZV1motwHNp",
    "/ipfs/QmPHhyEQhAv7whLwankMH4u7zyF8P1b5LoWwcniQVEvWMm",
    "/ipfs/QmbUAmRVLkbkWvobvKudoAuAeLqYLEhSo7oR3sr7Kwwvtx",
    "/ipfs/QmVxSVw8EUqV3rDGpBtWyDDbC2PSS4NCr496CwVAKQSW8W",
    "/ipfs/QmatfzDL5iuMVcGbVFgN67bV6gbobYswdoC3xMKyAAxq9S"
  ]

  var entry_max_scores = {}

  var entry_cid_with_best_bracket = null
  var max_score_of_best_entry = 0
  for (var entry_cid of entries) {
    var max_score = await max_score_of_entry(results, entry_cid)
    entry_max_scores[entry_cid] = max_score

    if(max_score > max_score_of_best_entry) {
      entry_cid_with_best_bracket = entry_cid
      max_score_of_best_entry = max_score
    }
  }

  var rewards = {}

  var rank = 1
  let num_of_brackets = 100*10
  var pot_size = num_of_brackets * bignum(1000000000) // 10^9 wei per bracket
  let calculate_reward_f = get_calculate_reward_f(num_of_brackets)
  var cur_reward = calculate_reward_f(pot_size)
  var t1 = 0
  var t2 = 0

  while (cur_reward >= 1) {
    var s1 = new Date()
    max_score_of_best_entry = entry_max_scores[entry_cid_with_best_bracket]
    rewards[entry_cid_with_best_bracket] = (rewards[entry_cid_with_best_bracket] || 0) + cur_reward

    let new_max_score = await max_score_of_entry(results, entry_cid, max_score_of_best_entry)
    entry_max_scores[entry_cid_with_best_bracket] = new_max_score

    rank += 1
    pot_size -= cur_reward
    cur_reward = calculate_reward_f(pot_size)
    t1 += new Date() - s1

    // Recalculate best entry
    var s2 = new Date()
    entry_cid_with_best_bracket = get_entry_with_best_bracket(entry_max_scores)
    t2 += new Date() - s2
  }

  console.log(`average t1: ${t1 / rank}`)
  console.log(`average t2: ${t2 / rank}`)

  console.log(rank)
  console.log(rewards)
  console.log(num_of_brackets * bignum(1000000000))
  console.log(Object.keys(rewards).reduce((a, b) => {
    return a + rewards[b]
  }, 0))

  ipfs.stop(error => {
    if (error) {
      return console.error('Node failed to stop cleanly!', error)
    }
    console.log('Node stopped!')
    process.exit()
  })

})

// Rewards

function get_entry_with_best_bracket(entry_max_scores) {
  return Object.keys(entry_max_scores).reduce((a, b) => {
    if (entry_max_scores[a] == entry_max_scores[b]) {
      return a > b ? a : b // Tiebreaker: string comparison of cid
    } else {
      return entry_max_scores[a] > entry_max_scores[b] ? a : b
    }
  })
}

function get_calculate_reward_f(num_of_brackets) { // in wei
  let e = Math.log(num_of_brackets) / Math.log(10) // log[10](num_of_brackets)
  let p = Math.pow(10, (2-e))
  return function calculate_reward(pot_size) {
    return Math.ceil(p * pot_size)
  }
}

// Scoring

function max_score_of_entry(results, entry_cid, prev_max) {
  return new Promise((resolve, reject) => {
    let stream = ipfs.files.catPullStream(entry_cid)

    pull(
      stream,
      map((data) => {
        // var t = 0
        var max_score = 0
        for (var i = 0; i < data.length/8; i++) {
          var start = new Date()

          let bracket = bignum.fromBuffer(data.slice(i, i+8))
          let score = score_bracket(results, bracket)

          // t += new Date() - start
          if (prev_max) {
            if (score > max_score && score < prev_max) {
              max_score = score
            }
          } else {
            max_score = Math.max(max_score, score)
          }
        }
        // console.log(`average time: ${t / (data.length/8)}`)
        // console.log(`max_score: ${max_score}`)
        return max_score
      }),
      reduce((acc, cur) => {
        return Math.max(acc, cur)
      }, 0, (err, res) => {
        if (err) reject(err)
        resolve(res)
      })
    )
  })
}

function score_bracket(results, bracket) {
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
