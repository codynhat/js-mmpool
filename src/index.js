const IPFS = require('ipfs')
const Scoring = require('./scoring')
const Rewards = require('./rewards')

const pull = require('pull-stream')
const map = require('pull-stream/throughs/map')
const reduce = require('pull-stream/sinks/reduce')
const fs = require('fs')
const bignum = require('bignum')

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

  var entry_scores = {}

  var best_entry_cid = null
  var max_score_of_best_entry = 0
  for (var entry_cid of entries) {
    var scores = await Scoring.scores_of_entry(ipfs, results, entry_cid)
    entry_scores[entry_cid] = scores

    let max_score = Scoring.max_score_of_entry(scores)

    if(max_score > max_score_of_best_entry) {
      best_entry_cid = entry_cid
      max_score_of_best_entry = max_score
    }
  }

  var rewards = {}

  let num_of_brackets = 100*10
  var pot_size = num_of_brackets * bignum(1000000000) // 10^9 wei per bracket
  let calculate_reward_f = Rewards.get_calculate_reward_f(num_of_brackets)
  var cur_reward = calculate_reward_f(pot_size)

  while (cur_reward >= 1) {
    rewards[best_entry_cid] = (rewards[best_entry_cid] || 0) + cur_reward

    var new_entry_scores = entry_scores[best_entry_cid]
    new_entry_scores[max_score_of_best_entry] = new_entry_scores[max_score_of_best_entry] - 1
    entry_scores[best_entry_cid] = new_entry_scores

    pot_size -= cur_reward
    cur_reward = calculate_reward_f(pot_size)

    // Recalculate best entry
    best_entry_cid = Rewards.get_best_entry_cid(entry_scores)
    max_score_of_best_entry = Scoring.max_score_of_entry(entry_scores[best_entry_cid])
  }

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
