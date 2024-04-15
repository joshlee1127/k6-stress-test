import crypto from "k6/crypto"
import encoding from "k6/encoding"
const JWT_HEADER_JSON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
// const secretKey = "d90375aed22401467f349b8d560b7265" //prod
// const secretKey = "6d7f3e4c81c13e91e6f47f99545bb248" //rc

// const gameId = 919 //prod
const gameId = 893 //rc

export function jwtGalaxy(body, secretKey) {
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
        signature.replace(/=/gi, "").replace(/\//gi, "_").replace(/\+/gi, "-"),
        "binary"
    )
    let requestSignatureBase64String = encoding.b64encode(signatureBytes)
    var GameToken = (signature + "." + requestSignatureBase64String)
        .replace(/=/gi, "")
        .replace(/\//gi, "_")
        .replace(/\+/gi, "-")

    return GameToken
}

export function generateRandomString(length) {
    // const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    const alphabet = "F"
    let randomString = alphabet.charAt(
        Math.floor(Math.random() * alphabet.length)
    )
    const digits = "0123456789"
    for (let i = 0; i < length; i++) {
        randomString += digits.charAt(Math.floor(Math.random() * digits.length))
    }
    return randomString
}
