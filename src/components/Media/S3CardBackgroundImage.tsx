"use client";

import { useS3ImageUrl } from "@/utils/useS3ImageUrl";
import Image from "next/image";

type S3CardBackgroundImageProps = {
  s3Key?: string | null;
  alt: string;
  sizes: string;
  className: string;
  priority?: boolean;
};

export default function S3CardBackgroundImage({
  s3Key,
  alt,
  sizes,
  className,
  priority = false,
}: S3CardBackgroundImageProps) {
  const { url } = useS3ImageUrl(s3Key);

  if (!url) return null;

  return (
    <Image
      src={url}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      priority={priority}
      loading={priority ? undefined : "lazy"}
    />
  );
}
