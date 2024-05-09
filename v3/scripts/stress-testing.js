import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js"
import { check, group } from "k6"

import http from "k6/http"
import { generateRandomString, jwtGalaxy } from "./jwt.js"
// envVar 控制壓測prod或rc,
// prod > 透過login bf取得accessToken來登入galaxy
// rc   > 透過Guest帳號 (radom) 登入galaxy
const envVar = "rc"
let galaxyBaseUrl
let secretKey
let gameId
let gameName
let guestMode
let galaxyBaseUrlSwoole
if (envVar === "prod") {
    galaxyBaseUrl = "https://galaxy.beanfun.com/webapi" //prod
    galaxyBaseUrlSwoole = "https://galaxy.beanfun.com/webapi"
    secretKey = "d90375aed22401467f349b8d560b7265" //prod
    gameId = 919 //prod
    gameName = "SRE_NETWORK_TEST"
    guestMode = false
} else {
    galaxyBaseUrlSwoole = "https://galaxy.beanfun.com/webapircswoole"
    galaxyBaseUrl = "https://galaxy.beanfun.com/webapirc" //rc
    secretKey = "6d7f3e4c81c13e91e6f47f99545bb248" //rc
    gameId = 893 //rc
    gameName = "loadtesting"
    guestMode = true
}

// const JWT_HEADER_JSON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
const openidBaseUrl = `https://openid.beanfun.com/api/SuperTest?clientId=d5d74b44-2fdf-49c2-a7e8-41905d21f313`
// const openidQueryToken = `https://openid.beanfun.com/api/accessToken?token=`
// const openidQueryToken = `https://openid.beanfun.com/api/QueryToken?token=`
// const demoUrl = "https://test-api.k6.io/public/crocodiles/"
// const SLEEP_TIME = 1

export const options = {
    scenarios: {
        constant_load: {
            executor: "ramping-arrival-rate",
            startRate: 20, // 开始速率
            timeUnit: "1s", // 时间单位为秒
            preAllocatedVUs: 20, // 预分配虚拟用户数
            stages: [
                { duration: "60s", target: 20 }, // 第一个阶段持续 10 秒，目标 TPS 为 5
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

export default function () {
    let userInfo = {}
    let session
    const orderId = generateRandomString(17)
    const username =
        "TWPTrial" +
        Math.floor(Math.random() * 149999 + 1)
            .toString()
            .padStart(6, "0")
    // const username = "TWPTrial000002"
    const password = "gama123456tw"
    // const username = "joshlee1110"
    // const password = "EWE114kirk191"
    // 0/bf/Login for token
    if (envVar === "prod") {
        group("/Bf/Login", function () {
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
            check(response, {
                "/Bf/Login": (r) => {
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
                            console.log("/Bf/Login failed", r.body)
                            return false
                        }
                    } else {
                        console.log("Login for accessToken Failed:")
                        return false
                    }
                },
            })
        })
    }
    // 1 /User/Login 透過第三方帳號登入 Session
    group("/User/Login", function () {
        const galaxyLoginUrl = galaxyBaseUrl + "/User/Login"

        const myUUID = uuidv4()
        let body = {}
        if (guestMode) {
            body = {
                PlatformType: 0,
                UserID: myUUID.split("-")[0],
            }
        } else {
            body = {
                AccessToken: `${userInfo.AccessToken}`,
                PlatformType: 1,
                UserID: `${userInfo.user_id}`,
            }
        }
        const gameToken = jwtGalaxy(body, secretKey)
        const headers = {
            GameID: gameId,
            GameToken: gameToken,
            GameClientVersion: "1.1.0",
            SDKClientVersion: "1.1.0",
            "Content-Type": "application/json",
        }
        const response = http.post(galaxyLoginUrl, JSON.stringify(body), {
            headers: headers,
        })
        check(response, {
            "/User/Login": (r) => {
                if (r.status === 200) {
                    if (r.json().Status.Code !== 0) {
                        const result = r.json()
                        console.log(
                            "Verify Galaxy UserSessionToken Status Code !== 0",
                            result
                            // userInfo.AccessToken,
                            // userInfo.user_id,
                            // username
                        )
                        return false
                    } else {
                        session = r.json()
                        return true
                    }
                } else {
                    console.log(
                        "Verify Galaxy UserSessionToken Status !== 200",
                        r
                    )
                    return false
                }
            },
        })
    })
    // 2 /User/VerifyToken 遊戲端驗證使用者登入權杖
    group("/User/VerifyToken", function () {
        const VerifyUrl = galaxyBaseUrlSwoole + "/User/VerifyToken"

        const body = {
            IsShowThirdPartyBinds: 1,
            UserObjectID: session.Results.UserObjectID,
            UserSessionToken: session.Results.UserSessionToken,
        }
        const gameToken = jwtGalaxy(body, secretKey)
        const headers = {
            GameID: gameId,
            GameToken: gameToken,
            "Content-Type": "application/json",
        }
        const response = http.post(VerifyUrl, JSON.stringify(body), {
            headers: headers,
        })

        check(response, {
            "/User/VerifyToken": (r) => {
                if (r.status !== 200) {
                    console.log("/User/VerifyToken failed", r.body)
                    return false
                } else {
                    // console.log("/User/VerifyToken", r.json())
                    return true
                }
            },
        })
    })
    // 3 /User/GetActionItem 定期取得使用者最新資訊
    group("/User/GetActionItem", function () {
        const VerifyUrl = galaxyBaseUrlSwoole + "/User/GetActionItem"
        const body = {}
        const gameToken = jwtGalaxy(body, secretKey)
        const headers = {
            "Content-Type": "application/json",
            UserObjectID: parseInt(session.Results.UserObjectID),
            UserSessionToken: session.Results.UserSessionToken,
            GameID: gameId,
            GameToken: gameToken,
            GameClientVersion: "1.1.0",
            SDKClientVersion: "1.1.0",
            DeviceType: 1,
        }
        const response = http.post(VerifyUrl, JSON.stringify(body), {
            headers: headers,
        })
        check(response, {
            "/User/GetActionItem": (r) => {
                if (r.status !== 200 || r.json().Status.Code !== 0) {
                    console.log("/User/GetActionItem failed", r.body)
                    return false
                } else {
                    // console.log("/User/GetActionItem", r.json())
                    return true
                }
            },
        })
    })
    // 4 /User/RenewSessionToken 重新取得使用者 Token
    group("/User/RenewSessionToken", function () {
        const renewSessionTokenUrl =
            galaxyBaseUrlSwoole + "/User/RenewSessionToken"
        const body = {}
        const gameToken = jwtGalaxy(body, secretKey)
        const headers = {
            UserObjectID: session.Results.UserObjectID,
            UserSessionToken: session.Results.UserSessionToken,
            GameID: gameId,
            GameToken: gameToken,
            GameClientVersion: "1.1.0",
            SDKClientVersion: "1.1.0",
            "Content-Type": "application/json",
        }
        const response = http.post(renewSessionTokenUrl, JSON.stringify(body), {
            headers: headers,
        })
        check(response, {
            "/User/RenewSessionToken": (r) => {
                if (r.status !== 200) {
                    if (r.status !== 200)
                        console.log("/User/RenewSessionToken failed", r.body)
                    return false
                } else {
                    return true
                }
            },
        })
    })
    // 5 /User/GetProfile 取得使用者頭像與暱稱(bf!, FB)
    // group("/User/GetProfile", function () {
    //     const VerifyUrl = galaxyBaseUrl + "/User/GetProfile"
    //     const body = {}
    //     const gameToken = jwtGalaxy(body, secretKey)
    //     const headers = {
    //         "Content-Type": "application/json",
    //         UserObjectID: parseInt(session.Results.UserObjectID),
    //         UserSessionToken: session.Results.UserSessionToken,
    //         GameID: gameId,
    //         GameToken: gameToken,
    //         GameClientVersion: "1.1.0",
    //         SDKClientVersion: "1.1.0",
    //         DeviceType: 2,
    //     }
    //     const response = http.post(VerifyUrl, JSON.stringify(body), {
    //         headers: headers,
    //     })
    //     check(response, {
    //         "/User/GetProfile": (r) => {
    //             if (r.status !== 200 || r.json().Status.Code !== 0) {
    //                 console.log("/User/GetProfile failed status", r.json())
    //                 return false
    //             } else {
    //                 console.log("/User/GetProfile", r.json())
    //                 return true
    //             }
    //         },
    //     })
    // })
    // 6 /Sandbox/Test/Order/Verify 雙平台商品購買
    group("/Sandbox/Test/Order/Verify", function () {
        const VerifyUrl = galaxyBaseUrlSwoole + "/Sandbox/Test/Order/Verify"
        const body = {
            Country: "TW",
            Currency: "TWD",
            OrderID: orderId,
            PaymentToken: orderId,
            PaymentType: 2,
            Price: "99.00",
            ProductObjectID: 0,
        }

        const gameToken = jwtGalaxy(body, secretKey)
        const parts = gameToken.split(".")
        const lastPart = parts[parts.length - 1]
        const headers = {
            "Content-Type": "application/json",
            UserObjectID: session.Results.UserObjectID,
            UserSessionToken: session.Results.UserSessionToken,
            GameID: gameId,
            GameToken: lastPart,
            GameClientVersion: "1.1.0",
            SDKClientVersion: "1.1.0",
        }

        const response = http.post(VerifyUrl, JSON.stringify(body), {
            headers: headers,
        })

        check(response, {
            "/Sandbox/Test/Order/Verify": (r) => {
                if (r.status !== 200 || r.json().Status.Code !== 0) {
                    console.log("/Sandbox/Text/Order/Verify failed", r.body)
                    return false
                } else {
                    // console.log("/Sandbox/Text/Order/Verify   ", r.json())
                    return true
                }
            },
        })
    })
    // 7 /Order/Receipt/Verify 遊戲伺服器驗證訂單付款有效性
    group("/Order/Receipt/Verify", function () {
        const VerifyUrl = galaxyBaseUrlSwoole + "/Order/Receipt/Verify"
        const body = {
            OrderID: orderId,
            PaymentType: 2,
            UserObjectID: session.Results.UserObjectID,
        }
        const gameToken = jwtGalaxy(body, secretKey)
        const headers = {
            "Content-Type": "application/json",
            GameID: gameId,
            GameToken: gameToken,
        }
        const response = http.post(VerifyUrl, JSON.stringify(body), {
            headers: headers,
        })
        check(response, {
            "/Order/Receipt/Verify": (r) => {
                if (r.status !== 200 || r.json().Status.Code !== 0) {
                    console.log("/Order/Receipt/Verify failed", r.body)
                    return false
                } else {
                    // console.log("/Order/Receipt/Verify failed 2", r.json())
                    return true
                }
            },
        })
    })
    // 8 /ItemToGame/Done 遊戲伺服器回傳道具置入完成
    group("/ItemToGame/Done", function () {
        const VerifyUrl = galaxyBaseUrlSwoole + "/ItemToGame/Done"
        const body = {
            Orders: [
                {
                    OrderType: 2,
                    WebshopOrderID: orderId,
                },
            ],
            UserObjectID: session.Results.UserObjectID,
        }
        const gameToken = jwtGalaxy(body, secretKey)
        const headers = {
            GameID: gameId,
            GameToken: gameToken,
            "Content-Type": "application/json",
        }
        const response = http.post(VerifyUrl, JSON.stringify(body), {
            headers: headers,
        })
        check(response, {
            "/ItemToGame/Done": (r) => {
                if (r.status !== 200) {
                    console.log(
                        "/ItemToGame/Done failed status !== 200",
                        r.body
                    )
                    return false
                } else {
                    return true
                }
            },
        })
    })
    // 9/view/login/{銀河配發之專案代碼}?redirect_url={接收登入完成之網址} 共登串接導轉連結
    group("/view/login/gameName", function () {
        const redirectUrl =
            "https://warsofprasia.beanfun.com/login/galaxyCallback"

        let VerifyUrl
        if (envVar === "prod") {
            VerifyUrl =
                galaxyBaseUrl +
                `/view/login/${gameName}?redirect_url=` +
                redirectUrl
        } else if (envVar === "rc") {
            VerifyUrl =
                galaxyBaseUrlSwoole +
                `/view/login/${gameName}?redirect_url=` +
                redirectUrl
        }

        const body = {}
        const gameToken = jwtGalaxy(body, secretKey)
        const headers = {
            "Content-Type": "application/json",
            UserObjectID: session.Results.UserObjectID,
            UserSessionToken: session.Results.UserSessionToken,
            GameClientVersion: "1.1.0",
            SDKClientVersion: "1.1.0",
            GameID: gameId,
            GameToken: gameToken,
        }
        const response = http.get(VerifyUrl, JSON.stringify(body), {
            headers: headers,
        })

        check(response, {
            "/view/login/": (r) => {
                if (r.url.includes("OTT:")) {
                    // console.log("/view/login/", r.url)
                    return true
                } else {
                    console.log("/view/login/ failed", r.body)
                    return false
                }
            },
        })
    })
    // 10/User/DeleteUser 刪除玩家在銀河系統內的帳號
    if (envVar !== "prod") {
        group("/User/DeleteUser", function () {
            const VerifyUrl = galaxyBaseUrlSwoole + "/User/DeleteUser"
            const body = {
                UserObjectName: session.Results.UserObjectName,
                DeleteAfterDays: 0,
            }
            const gameToken = jwtGalaxy(body, secretKey)
            const headers = {
                "Content-Type": "application/json",
                UserObjectID: session.Results.UserObjectID,
                UserSessionToken: session.Results.UserSessionToken,
                GameID: gameId,
                GameToken: gameToken,
                GameClientVersion: "1.1.0",
                SDKClientVersion: "1.1.0",
                GameLocale: "zh-TW",
            }
            const response = http.post(VerifyUrl, JSON.stringify(body), {
                headers: headers,
            })
            check(response, {
                "/User/DeleteUser": (r) => {
                    if (r.status !== 200) {
                        console.log("/User/DeleteUser !== 200", r.body)
                        return false
                    } else {
                        // console.log("/User/DeleteUser", r.body)
                        return true
                    }
                },
            })
        })
    }
}

// 行動技術部 銀河系統團隊有壓測腳本開發需求，需求如下，請協助開發，需求開發完成日期對方目前是期望在四月底，感恩~~

// 1/User/Login 透過第三方帳號登入 A
// 2/User/VerifyToken 遊戲端驗證使用者登入權杖
// 3/User/GetActionItem 定期取得使用者最新資訊
// 4/User/RenewSessionToken 重新取得使用者 Token
// 5/User/GetProfile 取得使用者頭像與暱稱(bf!, FB)
// 6/Sandbox/Test/Order/Verify 雙平台商品購買
// 7/ItemToGame/Receipt/Verify 驗證道具置入收據
// 8/ItemToGame/Done 遊戲伺服器回傳道具置入完成
// 9/view/login/{銀河配發之專案代碼}?redirect_url={接收登入完成之網址} 共登串接導轉連結
// 10/User/DeleteUser 刪除玩家在銀河系統內的帳號 I
