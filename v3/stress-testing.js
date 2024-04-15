import { check, group, sleep } from "k6"
import crypto from "k6/crypto"
import encoding from "k6/encoding"
import http, { cookieJar } from "k6/http"
import { jwtGalaxy } from "./jwt.js"

const galaxyLoginUrl = "https://galaxy.beanfun.com/webapi/User/Login"
const galaxyBaseUrl = "https://galaxy.beanfun.com/webapi"
const secretKey = "d90375aed22401467f349b8d560b7265"
const JWT_HEADER_JSON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
const openidBaseUrl = `https://openid.beanfun.com/api/SuperTest?clientId=d5d74b44-2fdf-49c2-a7e8-41905d21f313`
// const openidQueryToken = `https://openid.beanfun.com/api/accessToken?token=`
const openidQueryToken = `https://openid.beanfun.com/api/QueryToken?token=`

const SLEEP_TIME = 1

export const options = {
    scenarios: {
        constant_load: {
            executor: "ramping-arrival-rate",
            startRate: 1, // 开始速率
            timeUnit: "10s", // 时间单位为秒
            preAllocatedVUs: 100, // 预分配虚拟用户数
            stages: [
                { duration: "10s", target: 10 }, // 第一个阶段持续 10 秒，目标 TPS 为 5
                // { duration: "10s", target: 250 }, // 第二个阶段持续 10 秒，目标 TPS 为 10
                // { duration: "10s", target: 300 }, // 第三个阶段持续 10 秒，目标 TPS 为 15
            ],
        },
    },
}
export const options_2 = {
    scenarios: {
        constant_load: {
            executor: "constant-arrival-rate",
            rate: 100, // 每秒 20 請求 (10000 / 60)
            timeUnit: "1s", // 設定時間單位為秒
            duration: "10m", // 持續壓測 1 分鐘
            preAllocatedVUs: 100, // 預先分配 100 個虛擬使用者
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

export default function () {
    let userInfo = {}
    let session
    let params
    const username =
        "TWPTrial" +
        Math.floor(Math.random() * 149999 + 1)
            .toString()
            .padStart(6, "0")
    // const username = "TWPTrial000002"
    const password = "gama123456tw"

    group("Login", function () {
        const openidUrl =
            openidBaseUrl + `&username=${username}&password=${password}`

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
        // const response2 = http.get(openidQueryTokenUrl, {
        //     headers: {
        //         "Content-Type": "application/json",
        //     },
        // })
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
                    console.log("Login for accessToken Failed:")
                    return false
                }
            },
        })
        // check(response2, {
        //     "check accessToken": (r) => {
        //         if (r.status === 200) {
        //             if (r.json().is_valid) {
        //                 return true
        //             } else {
        //                 console.log(
        //                     "check accessToken Failed: is_valid !== true"
        //                 )
        //                 return false
        //             }
        //         } else {
        //             console.log("check accessToken Failed: status !== 200")
        //             return false
        //         }
        //     },
        // })
        // sleep(0.1)
    })

    group("Post galaxy Login Url", function () {
        params = {
            headers: {
                GameID: 919,
                GameClientVersion: "1.1.0",
                SDKClientVersion: "1.1.0",
                "Content-Type": "application/json",
            },
        }
        let body = {
            AccessToken: `${userInfo.AccessToken}`,
            PlatformType: 1,
            UserID: `${userInfo.user_id}`,
        }
        let requestData = {}
        Object.keys(body)
            .sort()
            .forEach(function (key) {
                requestData[key] = body[key]
            })
        let requestDataJSON = JSON.stringify(requestData)
        let requestDataBase64Encoded = encoding.b64encode(requestDataJSON)
        let signature = JWT_HEADER_JSON + "." + requestDataBase64Encoded
        let signatureBytes = crypto.hmac(
            "sha256",
            secretKey,
            signature
                .replace(/=/gi, "")
                .replace(/\//gi, "_")
                .replace(/\+/gi, "-"),
            "binary"
        )
        let requestSignatureBase64String = encoding.b64encode(signatureBytes)
        var GameToken = (signature + "." + requestSignatureBase64String)
            .replace(/=/gi, "")
            .replace(/\//gi, "_")
            .replace(/\+/gi, "-")
        params.headers.GameToken = GameToken
        console.log("params------<", params)
        const response = http.post(galaxyLoginUrl, JSON.stringify(body), {
            headers: params.headers,
        })
        check(response, {
            "Verify Galaxy UserSessionToken": (r) => {
                if (r.status === 200) {
                    if (r.json().Status.Code !== 0) {
                        const result = r.json()
                        console.log(
                            "Verify Galaxy UserSessionToken Status Code !== 0",
                            result,
                            userInfo.AccessToken,
                            userInfo.user_id,
                            username
                        )
                        return false
                    } else {
                        // console.log("add session to variable", r.json())
                        session = r.json()
                        return true
                    }
                } else {
                    console.log("Verify Galaxy UserSessionToken Status !== 200")
                    return false
                }
            },
        })
        sleep(0.5)
    })

    group("User/VerifyToken", function () {
        const VerifyUrl = galaxyBaseUrl + "/User/VerifyToken"

        const body = {
            IsShowThirdPartyBinds: 1,
            UserObjectID: session.Results.UserObjectID,
            UserSessionToken: session.Results.UserSessionToken,
        }
        const gameToken = jwtGalaxy(body)
        const headers = {
            GameID: 919,
            GameToken: gameToken,
            "Content-Type": "application/json",
        }
        const response = http.post(VerifyUrl, JSON.stringify(body), {
            headers: headers,
        })

        check(response, {
            "Galaxy /User/VerifyToken": (r) => {
                if (
                    r.status !== 200 ||
                    r.json().Status.Code !== 0 ||
                    undefined
                ) {
                    if (r.status !== 200)
                        console.log("/User/VerifyToken failed status !== 200")
                    console.log("/User/VerifyToken Failed", r.json())
                    return false
                } else {
                    // console.log("/User/VerifyToken", r.json())
                    return true
                }
            },
        })
    })
    group("User/GetLockStatus", function () {
        const getLockStatusUrl =
            galaxyBaseUrl +
            "/User/GetLockStatus/" +
            session.Results.UserObjectID

        const body = {}
        const gameToken = jwtGalaxy(body)

        const headers = {
            "Content-Type": "application/json",
            GameID: 919,
            GameToken: gameToken,
        }
        const response = http.post(getLockStatusUrl, JSON.stringify(body), {
            headers: headers,
        })

        check(response, {
            "Galaxy User/GetLockStatus": (r) => {
                if (
                    r.status !== 200 ||
                    r.json().Status.Code !== 0 ||
                    undefined
                ) {
                    if (r.status !== 200)
                        console.log("User/GetLockStatus failed status !== 200")
                    console.log("User/GetLockStatus Failed", r.json())
                    return false
                } else {
                    // console.log("User/GetLockStatus", r.json())
                    return true
                }
            },
        })
    })
    group("Product/GetList", function () {
        const getListUrl = galaxyBaseUrl + "/Product/GetList"

        const body = {
            PaymentType: 3,
            Country: session.Results.UserCountry,
        }

        const gameToken = jwtGalaxy(body)
        const headers = {
            UserObjectID: session.Results.UserObjectID,
            UserSessionToken: session.Results.UserSessionToken,
            GameID: "919",
            GameToken: gameToken,
            GameClientVersion: "1.1.0",
            SDKClientVersion: "1.1.0",
            "Content-Type": "application/json",
        }
        const response = http.post(getListUrl, JSON.stringify(body), {
            headers: headers,
        })
        check(response, {
            "Galaxy Product/GetList": (r) => {
                if (
                    r.status !== 200 ||
                    r.json().Status.Code !== 0 ||
                    undefined
                ) {
                    if (r.status !== 200)
                        console.log("request failed status !== 200")
                    console.log("Product/GetList Failed", r.json())
                    return false
                } else {
                    // console.log("Product/GetList", r.json())
                    return true
                }
            },
        })
    })

    group("User/RenewSessionToken", function () {
        const renewSessionTokenUrl = galaxyBaseUrl + "/User/RenewSessionToken"

        const body = {}

        const gameToken = jwtGalaxy(body)
        const headers = {
            UserObjectID: session.Results.UserObjectID,
            UserSessionToken: session.Results.UserSessionToken,
            GameID: "919",
            GameToken: gameToken,
            GameClientVersion: "1.1.0",
            SDKClientVersion: "1.1.0",
            "Content-Type": "application/json",
        }
        const response = http.post(renewSessionTokenUrl, JSON.stringify(body), {
            headers: headers,
        })
        check(response, {
            "User/RenewSessionToken": (r) => {
                if (
                    r.status !== 200 ||
                    r.json().Status.Code !== 0 ||
                    undefined
                ) {
                    if (r.status !== 200)
                        console.log(
                            "User/RenewSessionToken failed status !== 200"
                        )
                    console.log("User/RenewSessionToken Failed", r.json())
                    return false
                } else {
                    console.log("User/RenewSessionToken", r.json())
                    return true
                }
            },
        })
    })
    // sleep(SLEEP_TIME)
}
