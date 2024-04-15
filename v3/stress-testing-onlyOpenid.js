import { check, group, sleep } from "k6"
import crypto from "k6/crypto"
import encoding from "k6/encoding"
import http, { cookieJar } from "k6/http"

const galaxyLoginUrl = "https://galaxy.beanfun.com/webapi/User/Login"
const secretKey = "d90375aed22401467f349b8d560b7265"
const JWT_HEADER_JSON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
const openidBaseUrl = `https://openid.beanfun.com/api/SuperTest?clientId=d5d74b44-2fdf-49c2-a7e8-41905d21f313`
// const openidQueryToken = `https://openid.beanfun.com/api/accessToken?token=`
const openidQueryToken = `https://openid.beanfun.com/api/QueryToken?token=`

const SLEEP_TIME = 1
export const options_2 = {
    // vus: 100,
    // iterations: 100,

    scenarios: {
        constant_load: {
            executor: "constant-arrival-rate",
            rate: 20, // 初始每秒请求数
            timeUnit: "1s", // 时间单位为秒
            duration: "10s", // 持续压测 10 秒
            preAllocatedVUs: 1000, // 预分配虚拟用户数
        },
    },
}
export const options_1 = {
    //  vus: 3600,
    //  duration: '600s'
    //  vus: 400,
    //  duration: "1s",
    //  noConnectionReuse: true,
    //  noVUConnectionReuse: true
    //  batchPerHost: 100
    stages: [
        { duration: "20s", target: 20 }, // test
        // { duration: "1m", target: 400 }, // test
        // { duration: "2m", target: 100 }, // below normal load
        // { duration: "5m", target: 100 },
        // { duration: "2m", target: 200 }, // normal load
        // { duration: "5m", target: 200 },
        // { duration: "2m", target: 300 }, // around the breaking point
        // { duration: "5m", target: 300 },
        // { duration: "2m", target: 400 }, // beyond the breaking point
        // { duration: "5m", target: 400 },
        // { duration: "10m", target: 0 }, // scale down. Recovery stage.
    ],
}
const rate = 550
const target = rate
export const options = {
    scenarios: {
        ramping_load: {
            executor: "ramping-arrival-rate",
            startRate: rate, // 开始速率
            timeUnit: "1s", // 时间单位为秒
            preAllocatedVUs: 1500, // 预分配虚拟用户数
            stages: [
                // { duration: "10s", target: 200 }, // 第一个阶段持续 10 秒，目标 TPS 为
                // { duration: "10s", target: 250 }, // 第二个阶段持续 10 秒，目标 TPS 为
                // { duration: "10s", target: 300 }, // 第三个阶段持续 10 秒，目标 TPS 为
                // { duration: "10s", target: 400 }, // 第三个阶段持续 10 秒，目标 TPS 为
                { duration: "20s", target: target }, // 第三个阶段持续 10 秒，目标 TPS 为
                // { duration: "20s", target: 550 }, // 第三个阶段持续 10 秒，目标 TPS 为
                // { duration: "20s", target: 600 }, // 第三个阶段持续 10 秒，目标 TPS 为
                // { duration: "10s", target: 700 }, // 第三个阶段持续 10 秒，目标 TPS 为
                // { duration: "10s", target: 800 }, // 第三个阶段持续 10 秒，目标 TPS 为
            ],
        },
    },
}

export default function () {
    let userInfo = {}

    const username =
        "TWPTrial" +
        Math.floor(Math.random() * 149999 + 1)
            .toString()
            .padStart(6, "0")
    // const username = "TWPTrial000002"
    const password = "gama123456tw"
    // console.log(username)
    group("Login", function () {
        const startTime = new Date()
        const openidUrl =
            openidBaseUrl + `&username=${username}&password=${password}`
        // console.log("current login url:", openidUrl)
        const response = http.get(openidUrl, {
            headers: {
                "Content-Type": "application/json",
            },
        })
        let accessToken
        if (response.status === 200) {
            accessToken = response.json().AccessToken
        } else {
            accessToken = {}
            console.log("Login Failed with status code", response.status)
        }
        const openidQueryTokenUrl = openidQueryToken + accessToken
        // console.log(openidQueryTokenUrl)
        const response2 = http.get(openidQueryTokenUrl, {
            headers: {
                "Content-Type": "application/json",
            },
        })
        check(response, {
            "Login for accessToken": (r) => {
                if (r.status === 200) {
                    if (r.json().AccessToken) {
                        // 定义正则表达式
                        const regex = /"user_id":(\d+)/
                        const responseBody = r.body
                        const matches = responseBody.match(regex)
                        // 提取 user_id
                        const userId = matches ? matches[1] : null
                        userInfo = r.json()
                        userInfo.user_id = userId
                        return true
                    } else {
                        console.log("Can not get accessToken")
                        return false
                    }
                } else {
                    console.log("Login for accessToken Failed:", r)
                    return false
                }
            },
        })
        check(response2, {
            "accessToken is_valid ": (r) => {
                if (r.status === 200) {
                    if (r.json().is_valid) {
                        return true
                    } else {
                        console.log(
                            `check accessToken Failed: status:${r.status} is_valid !== true`
                        )
                        return false
                    }
                } else {
                    console.log(
                        `check accessToken Failed: status:${r.status} is_valid !== true`
                    )
                    return false
                }
            },
        })
        const endTime = new Date() // 记录 group 结束时间
        const duration = endTime - startTime // 计算 group 执行时间
        if (duration > 1000) {
            console.log(`Login group execution time: ${duration}ms`)
        }

        // sleep(0.1)
    })
}
