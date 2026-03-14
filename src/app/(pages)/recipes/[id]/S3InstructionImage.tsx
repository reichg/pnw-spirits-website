"use client";

import { useS3ImageUrl } from "@/utils/useS3ImageUrl";
import Image from "next/image";
import styles from "./RecipesPostPage.module.css";

export default function S3InstructionImage({
  s3Key,
  alt,
}: {
  s3Key: string;
  alt: string;
}) {
  const { url } = useS3ImageUrl(s3Key);
  if (!url) return null;
  return (
    <div className={styles.instructionImageContainer}>
      <Image
        src={url}
        alt={alt}
        width={600}
        height={340}
        sizes="(max-width: 768px) 90vw, 600px"
        className={styles.instructionImage}
      />
    </div>
  );
}
