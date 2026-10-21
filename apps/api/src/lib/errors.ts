import type { FastifyReply } from "fastify";
import type { ApiErrorBody } from "@lins/shared";

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly fields?: { name: string; message: string }[];

  constructor(
    statusCode: number,
    code: string,
    message: string,
    fields?: { name: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.fields = fields;
  }
}

export function errorBody(
  code: string,
  message: string,
  correlationId: string,
  fields?: { name: string; message: string }[],
): ApiErrorBody {
  return {
    error: {
      code,
      message,
      correlationId,
      ...(fields && fields.length > 0 ? { fields } : {}),
    },
  };
}

export function sendApiError(
  reply: FastifyReply,
  error: ApiError,
  correlationId: string,
): FastifyReply {
  return reply
    .code(error.statusCode)
    .send(errorBody(error.code, error.message, correlationId, error.fields));
}
