package random

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
)

var ErrInvalidLen = errors.New("invalid length")

func GetRandByteArray(length int) (buffer []byte, err error) {
	if length <= 0 {
		return nil, ErrInvalidLen
	}

	buffer = make([]byte, length)
	_, err = rand.Read(buffer)

	return
}

func GetRandBase64Str(length int) (string, error) {
	if length <= 0 {
		return "", ErrInvalidLen
	}

	data, err := GetRandByteArray(length)
	if err != nil {
		return "", err
	}

	return base64.StdEncoding.EncodeToString(data)[:length], nil
}

func MustGetRandBase64Str(length int) string {
	v, err := GetRandBase64Str(length)
	if err != nil {
		panic(err)
	}

	return v
}
