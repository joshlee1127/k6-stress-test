import crypto from "k6/crypto"
import encoding from "k6/encoding"
const JWT_HEADER_JSON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
const secretKey = "d90375aed22401467f349b8d560b7265"

export function jwtGalaxy(body) {
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
